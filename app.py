"""
Quran Live Translator - Simplified for Local Testing
====================================================
This version works WITHOUT qrcode library for quick local testing
Install full version with: pip install -r requirements.txt
"""

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import Dict, List, Optional, Set
import json
import time
import asyncio
from pathlib import Path
from collections import defaultdict

# Optional QR code support
try:
    import qrcode
    from io import BytesIO
    import base64
    QR_AVAILABLE = True
except ImportError:
    QR_AVAILABLE = False
    print("⚠️  QR code library not installed. QR page will not work.")
    print("   Install with: pip install qrcode[pil] pillow")

# ============================================================================
# App Setup
# ============================================================================

app = FastAPI(title="Quran Live Translator")

BASE_DIR = Path(__file__).parent
QURAN_DIR = BASE_DIR / "quran"

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# ============================================================================
# Connection Manager (Multi-User WebSocket)
# ============================================================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.current_verses: Dict[str, Dict] = {}
    
    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        self.active_connections[room_id].add(websocket)
        
        if room_id in self.current_verses:
            try:
                await websocket.send_json(self.current_verses[room_id])
            except:
                pass
        
        print(f"✓ Client connected to room '{room_id}' (total: {len(self.active_connections[room_id])})")
    
    def disconnect(self, websocket: WebSocket, room_id: str):
        self.active_connections[room_id].discard(websocket)
        if not self.active_connections[room_id]:
            del self.active_connections[room_id]
            if room_id in self.current_verses:
                del self.current_verses[room_id]
        print(f"✗ Client disconnected from room '{room_id}'")
    
    async def broadcast(self, room_id: str, message: dict):
        self.current_verses[room_id] = message
        
        disconnected = set()
        for connection in self.active_connections[room_id]:
            try:
                await connection.send_json(message)
            except:
                disconnected.add(connection)
        
        for connection in disconnected:
            self.disconnect(connection, room_id)


manager = ConnectionManager()

# ============================================================================
# Data Models
# ============================================================================

from dataclasses import dataclass

@dataclass
class VerseLocation:
    surah: int
    ayah: int
    def __str__(self):
        return f"{self.surah}:{self.ayah}"

@dataclass
class VerseData:
    surah: int
    ayah: int
    text: str
    first_word: str
    last_word: str
    words: List[str]
    translations: Dict[str, str]
    surah_name: str = ""

class DetectRequest(BaseModel):
    word: str
    lang: str = "en"
    room_id: str = "default"

# ============================================================================
# Arabic Normalizer
# ============================================================================

class ArabicNormalizer:
    TASHKEEL = ['ً', 'ٌ', 'ٍ', 'َ', 'ُ', 'ِ', 'ّ', 'ْ', 'ٰ', 'ۡ', 'ۢ', '۪', '۫', 'ۭ', 'ٓ', 'ٔ', 'ٕ']
    
    @staticmethod
    def normalize(text: str) -> str:
        if not text:
            return ""
        normalized = text
        for mark in ArabicNormalizer.TASHKEEL:
            normalized = normalized.replace(mark, '')
        normalized = (normalized.replace('أ', 'ا').replace('إ', 'ا')
                     .replace('آ', 'ا').replace('ٱ', 'ا')
                     .replace('ة', 'ه').replace('ى', 'ي').replace('ـ', ''))
        return ' '.join(normalized.split()).strip()
    
    @staticmethod
    def extract_words(text: str) -> List[str]:
        normalized = ArabicNormalizer.normalize(text)
        return [w for w in normalized.split() if w]

# ============================================================================
# Sequential Verse Engine
# ============================================================================

class SequentialVerseEngine:
    def __init__(self):
        self.rooms: Dict[str, Dict] = defaultdict(lambda: {
            'current_surah': None,
            'current_ayah': None,
            'last_detected_time': 0,
            'detection_count': 0
        })
        self.BACKWARD_TIME_THRESHOLD = 3.0
    
    def get_search_window(self, room_id: str, target_surah: int) -> List[int]:
        room = self.rooms[room_id]
        current_ayah = room['current_ayah']
        current_surah = room['current_surah']
        
        if current_ayah is None or current_surah != target_surah:
            return list(range(1, 5))
        
        window = [current_ayah, current_ayah + 1, current_ayah + 2]
        return window
    
    def update_position(self, room_id: str, detected_surah: int, detected_ayah: int) -> str:
        room = self.rooms[room_id]
        current_time = time.time()
        
        if room['current_surah'] is None:
            room['current_surah'] = detected_surah
            room['current_ayah'] = detected_ayah
            room['detection_count'] = 0
            room['last_detected_time'] = current_time
            return "initial"
        
        if room['current_surah'] != detected_surah:
            room['current_surah'] = detected_surah
            room['current_ayah'] = detected_ayah
            room['detection_count'] = 0
            room['last_detected_time'] = current_time
            return "new_surah"
        
        if room['current_ayah'] == detected_ayah:
            room['detection_count'] += 1
            room['last_detected_time'] = current_time
            return "repeat"
        
        if detected_ayah > room['current_ayah']:
            room['current_ayah'] = detected_ayah
            room['detection_count'] = 1
            room['last_detected_time'] = current_time
            return "forward"
        else:
            room['current_ayah'] = detected_ayah
            room['detection_count'] = 1
            room['last_detected_time'] = current_time
            return "backward"
    
    def should_display(self, room_id: str, detected_surah: int, detected_ayah: int) -> bool:
        room = self.rooms[room_id]
        current_time = time.time()
        time_diff = current_time - room['last_detected_time']
        
        if room['current_surah'] != detected_surah or room['current_ayah'] != detected_ayah:
            return True
        if time_diff > 0.5:
            return True
        return False

# ============================================================================
# Detection System
# ============================================================================

class FirstLastWordDetector:
    def __init__(self):
        self.first_word_index = defaultdict(list)
        self.last_word_index = defaultdict(list)
    
    def build_indexes(self, verses):
        for verse in verses:
            location = VerseLocation(verse.surah, verse.ayah)
            if verse.first_word:
                self.first_word_index[verse.first_word].append(location)
            if verse.last_word:
                self.last_word_index[verse.last_word].append(location)

class QuranWordIndex:
    def __init__(self):
        self.word_index = defaultdict(list)
    
    def build_index(self, verses):
        for verse in verses:
            location = VerseLocation(verse.surah, verse.ayah)
            for word in verse.words:
                self.word_index[word].append(location)

class AdvancedVerseDetector:
    def __init__(self):
        self.normalizer = ArabicNormalizer()
        self.sequential_engine = SequentialVerseEngine()
        self.first_last_detector = FirstLastWordDetector()
        self.word_index = QuranWordIndex()
        self.verses = {}
        self.surah_names = {}
    
    def load_verses(self, verses_data):
        verses = []
        for v in verses_data:
            words = self.normalizer.extract_words(v['text'])
            verse = VerseData(
                surah=v['surah'], ayah=v['ayah'], text=v['text'],
                first_word=words[0] if words else "",
                last_word=words[-1] if words else "",
                words=words, translations=v.get('translations', {}),
                surah_name=v.get('surah_name', '')
            )
            verses.append(verse)
            self.verses[(verse.surah, verse.ayah)] = verse
            if verse.surah_name:
                self.surah_names[verse.surah] = verse.surah_name
        
        self.first_last_detector.build_indexes(verses)
        self.word_index.build_index(verses)
    
    def detect_verse(self, spoken_word: str, lang: str, room_id: str) -> Optional[Dict]:
        normalized_word = self.normalizer.normalize(spoken_word)
        if not normalized_word:
            return None
        
        target_surah = self.sequential_engine.rooms[room_id]['current_surah'] or 1
        search_window = self.sequential_engine.get_search_window(room_id, target_surah)
        
        matches = []
        for word, locations in self.word_index.word_index.items():
            if word == normalized_word:
                matches = [loc for loc in locations if loc.surah == target_surah and loc.ayah in search_window]
                break
        
        if not matches:
            matches = self.word_index.word_index.get(normalized_word, [])[:1]
        
        if not matches:
            return None
        
        best_match = matches[0]
        verse_key = (best_match.surah, best_match.ayah)
        
        if verse_key not in self.verses:
            return None
        
        verse = self.verses[verse_key]
        should_display = self.sequential_engine.should_display(room_id, best_match.surah, best_match.ayah)
        movement = self.sequential_engine.update_position(room_id, best_match.surah, best_match.ayah)
        
        return {
            "surah": verse.surah,
            "ayah": verse.ayah,
            "text": verse.text,
            "translation": verse.translations.get(lang, verse.translations.get("en", "")),
            "surah_name": self.surah_names.get(verse.surah, ""),
            "movement": movement,
            "should_display": should_display,
            "all_translations": verse.translations
        }

detector = AdvancedVerseDetector()

# ============================================================================
# API Endpoints
# ============================================================================

@app.on_event("startup")
async def startup_event():
    print("=" * 60)
    print("Quran Live Translator - Starting...")
    print("=" * 60)
    
    verses = []
    loaded_surahs = []
    
    for surah_num in range(1, 115):
        try:
            surah_file = QURAN_DIR / f"{surah_num:02d}.json"
            if not surah_file.exists():
                continue
            
            with open(surah_file, 'r', encoding='utf-8') as f:
                surah_data = json.load(f)
                surah_name = surah_data.get('name', f'Surah {surah_num}')
                
                for verse in surah_data.get('verses', []):
                    verse['surah'] = surah_data['surah']
                    verse['surah_name'] = surah_name
                    verses.append(verse)
                
                loaded_surahs.append(f"{surah_num}:{surah_name}")
        except Exception as e:
            print(f"Error loading surah {surah_num}: {e}")
    
    detector.load_verses(verses)
    
    if loaded_surahs:
        print(f"✓ Loaded {len(loaded_surahs)} surahs")
        for surah in loaded_surahs[:5]:
            print(f"  - {surah}")
        if len(loaded_surahs) > 5:
            print(f"  + {len(loaded_surahs) - 5} more surahs")
    else:
        print("⚠️  No surahs loaded! Make sure quran/*.json files exist")
    
    print("=" * 60)


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("live.html", {"request": request})


@app.get("/projector", response_class=HTMLResponse)
async def projector(request: Request, lang: str = "en", room: str = "default"):
    """Projector display mode"""
    return templates.TemplateResponse("projector.html", {
        "request": request,
        "lang": lang,
        "room_id": room
    })


@app.get("/qr", response_class=HTMLResponse)
async def qr_page(request: Request, room: str = "default"):
    """QR code page"""
    if not QR_AVAILABLE:
        return HTMLResponse("""
            <html><body style="font-family: sans-serif; padding: 40px;">
            <h1>QR Code Feature Not Available</h1>
            <p>Install QR code library:</p>
            <pre>pip install qrcode[pil] pillow</pre>
            <p>Then restart the server.</p>
            <a href="/">← Back to Home</a>
            </body></html>
        """)
    
    base_url = str(request.base_url).rstrip('/')
    qr_codes = {}
    
    languages = {
        'en': 'English',
        'fr': 'Français',
        'de': 'Deutsch',
        'es': 'Español',
        'nl': 'Nederlands'
    }
    
    for lang_code, lang_name in languages.items():
        url = f"{base_url}/projector?lang={lang_code}&room={room}"
        
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(url)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        img_str = base64.b64encode(buffer.getvalue()).decode()
        
        qr_codes[lang_code] = {
            'name': lang_name,
            'url': url,
            'qr_data': f"data:image/png;base64,{img_str}"
        }
    
    return templates.TemplateResponse("qr.html", {
        "request": request,
        "qr_codes": qr_codes,
        "room_id": room
    })


@app.post("/detect")
async def detect_verse(request: DetectRequest):
    try:
        result = detector.detect_verse(request.word, request.lang, request.room_id)
        
        if result is None:
            return JSONResponse(status_code=404, content={"error": "Word not found"})
        
        if result['should_display']:
            await manager.broadcast(request.room_id, result)
        
        return JSONResponse(content=result)
        
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await manager.connect(websocket, room_id)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"pong: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)


@app.get("/api/rooms")
async def get_rooms():
    return {
        "rooms": [
            {
                "room_id": room_id,
                "connections": len(connections),
                "current_verse": manager.current_verses.get(room_id, {})
            }
            for room_id, connections in manager.active_connections.items()
        ]
    }


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "total_verses": len(detector.verses),
        "active_rooms": len(manager.active_connections),
        "total_connections": sum(len(conns) for conns in manager.active_connections.values())
    }


if __name__ == "__main__":
    import uvicorn
    import os
    
    port = int(os.getenv("PORT", 5000))
    
    print(f"\n🚀 Starting server on port {port}...")
    print(f"📡 URL: http://localhost:{port}")
    print(f"📱 PWA: {'Enabled' if QR_AVAILABLE else 'Partial (no QR)'}")
    print(f"🔌 WebSocket: Enabled")
    print(f"🕌 Multi-Room: Supported\n")
    
    uvicorn.run(app, host="0.0.0.0", port=port)