// Quran Live Translator - FINAL FIXED VERSION
// النسخة النهائية المُصلحة
// 
// الإصلاحات:
// 1. إرسال فوري للصفحة
// 2. بدون إشعارات "Found"
// 3. تحكم كامل في حجم ولون خط الترجمة
// 4. يعمل مع جميع السور

let recognition = null;
let isListening = false;
let currentLanguage = 'en';
let lastDetectedVerse = null;

// إعدادات كاملة
let settings = {
    fontSize: 60,                    // حجم الخط العربي
    translationFontSize: 20,         // حجم خط الترجمة
    showArabic: true,
    theme: 'dark',
    bgColor: 'default',
    textColor: 'white',
    translationColor: 'gray',        // لون خط الترجمة
    language: 'en'
};

// العناصر
const micButton = document.getElementById('micButton');
const micIcon = document.getElementById('micIcon');
const stopIcon = document.getElementById('stopIcon');
const statusMessage = document.getElementById('statusMessage');
const listeningIndicator = document.getElementById('listeningIndicator');
const detectedWords = document.getElementById('detectedWords');
const initialState = document.getElementById('initialState');
const verseDisplay = document.getElementById('verseDisplay');
const languageSelect = document.getElementById('languageSelect');
const surahInfo = document.getElementById('surahInfo');
const arabicText = document.getElementById('arabicText');
const arabicTextContainer = document.getElementById('arabicTextContainer');
const translationText = document.getElementById('translationText');
const settingsSidebar = document.getElementById('settingsSidebar');
const settingsOverlay = document.getElementById('settingsOverlay');
const openSettingsBtn = document.getElementById('openSettings');
const closeSettingsBtn = document.getElementById('closeSettings');
const fontSizeRange = document.getElementById('fontSizeRange');
const fontSizeValue = document.getElementById('fontSizeValue');
const translationFontSizeRange = document.getElementById('translationFontSizeRange');
const translationFontSizeValue = document.getElementById('translationFontSizeValue');
const toggleArabic = document.getElementById('toggleArabic');
const darkModeBtn = document.getElementById('darkModeBtn');
const lightModeBtn = document.getElementById('lightModeBtn');
const settingsLanguage = document.getElementById('settingsLanguage');
const resetSettingsBtn = document.getElementById('resetSettings');

// ============================================================================
// إدارة الإعدادات
// ============================================================================

function loadSettings() {
    const saved = localStorage.getItem('quranTranslatorSettings');
    if (saved) {
        try {
            settings = { ...settings, ...JSON.parse(saved) };
        } catch (e) {
            console.error('خطأ في تحميل الإعدادات:', e);
        }
    }
    applySettings();
}

function saveSettings() {
    localStorage.setItem('quranTranslatorSettings', JSON.stringify(settings));
}

function applySettings() {
    // حجم الخط العربي
    arabicText.style.fontSize = `${settings.fontSize}px`;
    fontSizeRange.value = settings.fontSize;
    fontSizeValue.textContent = `${settings.fontSize}px`;
    
    // حجم خط الترجمة - التحكم الكامل
    translationText.style.fontSize = `${settings.translationFontSize}px`;
    if (translationFontSizeRange) {
        translationFontSizeRange.value = settings.translationFontSize;
        translationFontSizeValue.textContent = `${settings.translationFontSize}px`;
    }
    
    // إظهار/إخفاء العربي
    toggleArabic.checked = settings.showArabic;
    arabicTextContainer.classList.toggle('hidden', !settings.showArabic);
    
    // المظهر
    document.body.classList.toggle('light-mode', settings.theme === 'light');
    updateThemeButtons();
    
    // الألوان
    applyBackgroundColor(settings.bgColor);
    applyTextColor(settings.textColor);
    applyTranslationColor(settings.translationColor);
    
    // اللغة
    currentLanguage = settings.language;
    languageSelect.value = settings.language;
    settingsLanguage.value = settings.language;
}

function updateThemeButtons() {
    if (settings.theme === 'light') {
        lightModeBtn.classList.add('bg-gray-200', 'text-gray-900', 'border-emerald-500');
        lightModeBtn.classList.remove('bg-gray-700', 'text-gray-300', 'border-transparent');
        darkModeBtn.classList.remove('bg-gray-800', 'text-white', 'border-emerald-500');
        darkModeBtn.classList.add('bg-gray-300', 'text-gray-600', 'border-transparent');
    } else {
        darkModeBtn.classList.add('bg-gray-800', 'text-white', 'border-emerald-500');
        darkModeBtn.classList.remove('bg-gray-700', 'text-gray-300', 'border-transparent');
        lightModeBtn.classList.remove('bg-gray-200', 'text-gray-900', 'border-emerald-500');
        lightModeBtn.classList.add('bg-gray-700', 'text-gray-300', 'border-transparent');
    }
}

function applyBackgroundColor(color) {
    const bgGradients = {
        default: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        purple: 'linear-gradient(135deg, #2d1b69 0%, #5b2c6f 50%, #3d1e4f 100%)',
        green: 'linear-gradient(135deg, #134e4a 0%, #064e3b 50%, #042f2e 100%)',
        navy: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #020617 100%)',
        gray: 'linear-gradient(135deg, #374151 0%, #1f2937 50%, #111827 100%)'
    };
    if (settings.theme === 'dark') {
        document.body.style.background = bgGradients[color] || bgGradients.default;
    }
    document.querySelectorAll('[data-bg-color]').forEach(el => {
        el.classList.toggle('selected', el.dataset.bgColor === color);
    });
}

function applyTextColor(color) {
    const colors = {
        white: '#ffffff',
        emerald: '#10b981',
        blue: '#3b82f6',
        amber: '#f59e0b',
        rose: '#f43f5e'
    };
    arabicText.style.color = colors[color] || colors.white;
    document.querySelectorAll('[data-text-color]').forEach(el => {
        el.classList.toggle('selected', el.dataset.textColor === color);
    });
}

function applyTranslationColor(color) {
    // لون خط الترجمة - التحكم الكامل
    const colors = {
        white: '#ffffff',
        gray: '#d1d5db',
        emerald: '#10b981',
        blue: '#3b82f6',
        amber: '#f59e0b'
    };
    translationText.style.color = colors[color] || colors.gray;
    document.querySelectorAll('[data-trans-color]').forEach(el => {
        el.classList.toggle('selected', el.dataset.transColor === color);
    });
}

function resetSettings() {
    settings = {
        fontSize: 60,
        translationFontSize: 20,
        showArabic: true,
        theme: 'dark',
        bgColor: 'default',
        textColor: 'white',
        translationColor: 'gray',
        language: 'en'
    };
    applySettings();
    saveSettings();
}

// ============================================================================
// معالجات واجهة الإعدادات
// ============================================================================

function setupSettingsHandlers() {
    openSettingsBtn.addEventListener('click', () => {
        settingsSidebar.classList.add('open');
        settingsOverlay.classList.add('active');
    });
    
    closeSettingsBtn.addEventListener('click', closeSettings);
    settingsOverlay.addEventListener('click', closeSettings);
    
    // حجم الخط العربي
    fontSizeRange.addEventListener('input', (e) => {
        settings.fontSize = parseInt(e.target.value);
        fontSizeValue.textContent = `${settings.fontSize}px`;
        arabicText.style.fontSize = `${settings.fontSize}px`;
        saveSettings();
    });
    
    // حجم خط الترجمة - مُصلح
    if (translationFontSizeRange) {
        translationFontSizeRange.addEventListener('input', (e) => {
            settings.translationFontSize = parseInt(e.target.value);
            translationFontSizeValue.textContent = `${settings.translationFontSize}px`;
            translationText.style.fontSize = `${settings.translationFontSize}px`;
            saveSettings();
        });
    }
    
    toggleArabic.addEventListener('change', (e) => {
        settings.showArabic = e.target.checked;
        arabicTextContainer.classList.toggle('hidden', !settings.showArabic);
        saveSettings();
    });
    
    darkModeBtn.addEventListener('click', () => {
        settings.theme = 'dark';
        applySettings();
        saveSettings();
    });
    
    lightModeBtn.addEventListener('click', () => {
        settings.theme = 'light';
        applySettings();
        saveSettings();
    });
    
    document.querySelectorAll('[data-bg-color]').forEach(el => {
        el.addEventListener('click', () => {
            settings.bgColor = el.dataset.bgColor;
            applyBackgroundColor(settings.bgColor);
            saveSettings();
        });
    });
    
    document.querySelectorAll('[data-text-color]').forEach(el => {
        el.addEventListener('click', () => {
            settings.textColor = el.dataset.textColor;
            applyTextColor(settings.textColor);
            saveSettings();
        });
    });
    
    // لون خط الترجمة - مُصلح
    document.querySelectorAll('[data-trans-color]').forEach(el => {
        el.addEventListener('click', () => {
            settings.translationColor = el.dataset.transColor;
            applyTranslationColor(settings.translationColor);
            saveSettings();
        });
    });
    
    settingsLanguage.addEventListener('change', (e) => {
        settings.language = e.target.value;
        currentLanguage = e.target.value;
        languageSelect.value = e.target.value;
        saveSettings();
        if (lastDetectedVerse) {
            detectVerse(lastDetectedVerse.word, currentLanguage);
        }
    });
    
    resetSettingsBtn.addEventListener('click', resetSettings);
}

function closeSettings() {
    settingsSidebar.classList.remove('open');
    settingsOverlay.classList.remove('active');
}

// ============================================================================
// التهيئة
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 مترجم القرآن الحي - النسخة النهائية');
    loadSettings();
    if (!checkBrowserSupport()) return;
    initializeSpeechRecognition();
    setupEventListeners();
    setupSettingsHandlers();
    updateStatus('جاهز للاستماع', 'info');
});

function checkBrowserSupport() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        updateStatus('التعرف على الكلام غير مدعوم', 'error');
        micButton.disabled = true;
        micButton.classList.add('opacity-50', 'cursor-not-allowed');
        return false;
    }
    return true;
}

// ============================================================================
// التعرف على الكلام
// ============================================================================

function initializeSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    
    recognition.onstart = () => console.log('✓ بدأ الاستماع');
    recognition.onresult = handleRecognitionResult;
    recognition.onerror = handleRecognitionError;
    recognition.onend = handleRecognitionEnd;
}

function handleRecognitionResult(event) {
    const results = event.results;
    const lastResultIndex = results.length - 1;
    const result = results[lastResultIndex];
    const transcript = result[0].transcript.trim();
    const isFinal = result.isFinal;
    
    detectedWords.querySelector('p').textContent = transcript;
    
    if (isFinal && transcript) {
        processTranscript(transcript);
    }
}

function handleRecognitionError(event) {
    if (event.error === 'no-speech') {
        updateStatus('لم يتم الكشف عن كلام', 'warning');
        return;
    }
    
    let errorMessage = 'حدث خطأ';
    switch (event.error) {
        case 'audio-capture':
            errorMessage = 'الميكروفون غير متاح';
            break;
        case 'not-allowed':
            errorMessage = 'تم رفض إذن الميكروفون';
            break;
        case 'network':
            errorMessage = 'خطأ في الشبكة';
            break;
        default:
            errorMessage = `خطأ: ${event.error}`;
    }
    
    updateStatus(errorMessage, 'error');
    
    if (['audio-capture', 'not-allowed'].includes(event.error)) {
        stopListening();
    }
}

function handleRecognitionEnd() {
    if (isListening) {
        try {
            recognition.start();
        } catch (error) {
            isListening = false;
            micButton.classList.remove('mic-active');
        }
    }
}

// ============================================================================
// معالجات الأحداث
// ============================================================================

function setupEventListeners() {
    micButton.addEventListener('click', toggleListening);
    
    languageSelect.addEventListener('change', (e) => {
        currentLanguage = e.target.value;
        settings.language = e.target.value;
        settingsLanguage.value = e.target.value;
        saveSettings();
        if (lastDetectedVerse) {
            detectVerse(lastDetectedVerse.word, currentLanguage);
        }
    });
}

function toggleListening() {
    isListening ? stopListening() : startListening();
}

function startListening() {
    try {
        recognition.start();
        isListening = true;
        micButton.classList.add('mic-active');
        micIcon.classList.add('hidden');
        stopIcon.classList.remove('hidden');
        listeningIndicator.classList.add('active');
        updateStatus('يستمع...', 'listening');
    } catch (error) {
        updateStatus('فشل البدء', 'error');
    }
}

function stopListening() {
    try {
        recognition.stop();
        isListening = false;
        micButton.classList.remove('mic-active');
        micIcon.classList.remove('hidden');
        stopIcon.classList.add('hidden');
        listeningIndicator.classList.remove('active');
        updateStatus('متوقف', 'info');
        detectedWords.querySelector('p').textContent = '';
    } catch (error) {
        console.error('خطأ في الإيقاف:', error);
    }
}

// ============================================================================
// معالجة النص المنطوق
// ============================================================================

function processTranscript(transcript) {
    const words = transcript.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return;
    
    // جمع آخر 5 كلمات
    let wordsToTry = [];
    for (let i = words.length - 1; i >= 0 && wordsToTry.length < 5; i--) {
        const word = words[i].trim();
        if (word) wordsToTry.push(word);
    }
    
    // محاولة كل كلمة بالتسلسل - إرسال فوري
    tryNextWord(wordsToTry, 0);
}

async function tryNextWord(words, index) {
    if (index >= words.length) {
        updateStatus('يستمع...', 'listening');
        return;
    }
    
    const word = words[index];
    
    try {
        const response = await fetch('/detect', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({word: word, lang: currentLanguage})
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // إرسال فوري للصفحة - بدون تأخير
            if (data.should_display) {
                lastDetectedVerse = {word, ...data};
                displayVerse(data);  // عرض فوري
                updateStatus('تم الكشف', 'success');
                // بدون إشعار "Found" - تم الحذف
            }
            return;
        } else {
            // جرب الكلمة التالية بسرعة
            setTimeout(() => tryNextWord(words, index + 1), 30);
        }
    } catch (error) {
        setTimeout(() => tryNextWord(words, index + 1), 30);
    }
}

async function detectVerse(word, lang = 'en') {
    try {
        const response = await fetch('/detect', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({word: word, lang: lang})
        });
        
        const data = await response.json();
        
        if (response.ok) {
            lastDetectedVerse = {word, ...data};
            displayVerse(data);
        }
    } catch (error) {
        console.error('خطأ:', error);
    }
}

// ============================================================================
// تحديث الواجهة
// ============================================================================

function displayVerse(data) {
    // إخفاء الحالة الأولية
    initialState.classList.add('hidden');
    verseDisplay.classList.remove('hidden');
    verseDisplay.classList.add('fade-in');
    
    // تحديث معلومات السورة
    const surahName = data.surah_name ? ` - ${data.surah_name}` : '';
    surahInfo.textContent = `سورة ${data.surah}${surahName} : آية ${data.ayah}`;
    
    // تحديث النص العربي
    arabicText.textContent = data.text;
    
    // تحديث الترجمة مع تطبيق الإعدادات
    translationText.textContent = data.translation;
    translationText.style.fontSize = `${settings.translationFontSize}px`;
    applyTranslationColor(settings.translationColor);
    
    // التمرير للأعلى
    window.scrollTo({top: 0, behavior: 'smooth'});
}

function updateStatus(message, type = 'info') {
    const statusText = statusMessage.querySelector('p');
    statusText.textContent = message;
    statusText.className = 'text-sm';
    
    const colorClass = {
        listening: 'text-emerald-400',
        success: 'text-emerald-400',
        error: 'text-red-400',
        warning: 'text-yellow-400',
        info: 'text-gray-400'
    }[type] || 'text-gray-400';
    
    statusText.classList.add(colorClass);
}

// ============================================================================
// وظائف التصحيح
// ============================================================================

window.quranTranslator = {
    testWord: (word, lang = 'en') => detectVerse(word, lang),
    getSettings: () => settings,
    reset: async () => {
        await fetch('/reset', {method: 'POST'});
        console.log('✓ تم إعادة التعيين');
    },
    version: '2.0-FINAL'
};

console.log('💡 أوامر التصحيح متاحة:');
console.log('  window.quranTranslator.testWord("الحمد")');
console.log('  window.quranTranslator.reset()');
console.log('  window.quranTranslator.getSettings()');