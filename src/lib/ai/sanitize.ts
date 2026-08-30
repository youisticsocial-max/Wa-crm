/**
 * Helper utilities to sanitize script (enforce Roman Hinglish over Devanagari)
 * and format messages for optimal WhatsApp readability.
 */

/** Check if text contains Devanagari characters (\u0900-\u097F) */
export function hasDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text)
}

/** Map of common Devanagari Hindi words to Roman Hinglish */
const DEVANAGARI_WORD_MAP: Record<string, string> = {
  'नमस्ते': 'Namaste',
  'नमस्कार': 'Namaskar',
  'धन्यवाद': 'Dhanyawad',
  'शुक्रिया': 'Shukriya',
  'समझ': 'samajh',
  'गया': 'gaya',
  'गए': 'gaye',
  'गई': 'gayi',
  'आपको': 'aapko',
  'आपकी': 'aapki',
  'आपके': 'aapke',
  'आप': 'aap',
  'हम': 'hum',
  'हमे': 'hume',
  'हमें': 'hume',
  'हमारा': 'hamara',
  'हमारी': 'hamari',
  'हमारे': 'hamare',
  'है': 'hai',
  'हैं': 'hain',
  'हो': 'ho',
  'था': 'tha',
  'थी': 'thi',
  'थे': 'the',
  'हुई': 'hui',
  'हुआ': 'hua',
  'हुए': 'hue',
  'टीम': 'team',
  'बजट': 'budget',
  'टाइमलाइन': 'timeline',
  'दिन': 'din',
  'रुपये': 'rupees',
  'रुपए': 'rupees',
  'लाख': 'lakh',
  'हजार': 'hazar',
  'कृपया': 'kripya',
  'हाँ': 'haa',
  'हां': 'haa',
  'नहीं': 'nahi',
  'सकते': 'sakte',
  'सकता': 'sakta',
  'सकती': 'sakti',
  'करेंगे': 'karenge',
  'करते': 'karte',
  'करता': 'karta',
  'करती': 'karti',
  'करना': 'karna',
  'करने': 'karne',
  'रहा': 'raha',
  'रही': 'rahi',
  'रहे': 'rahe',
  'हूं': 'hoon',
  'हूँ': 'hoon',
  'और': 'aur',
  'तथा': 'aur',
  'के': 'ke',
  'लिए': 'liye',
  'की': 'ki',
  'का': 'ka',
  'को': 'ko',
  'से': 'se',
  'पर': 'par',
  'में': 'me',
  'तक': 'tak',
  'भी': 'bhi',
  'यह': 'ye',
  'ये': 'ye',
  'वह': 'wo',
  'वो': 'wo',
  'क्या': 'kya',
  'कब': 'kab',
  'कहाँ': 'kahan',
  'कहां': 'kahan',
  'कैसे': 'kaise',
  'कितना': 'kitna',
  'कितने': 'kitne',
  'कितनी': 'kitni',
  'चाहिए': 'chahiye',
  'अनुसार': 'anusar',
  'संभव': 'sambhav',
  'असंभव': 'asambhav',
  'विवरण': 'details',
  'जानकारी': 'jankari',
  'संपर्क': 'sampark',
  'पुष्टि': 'confirm',
  'बात': 'baat',
  'कस्टम': 'custom',
  'सॉफ्टवेयर': 'software',
}

/** Fallback character-by-character transliteration for any unmapped Devanagari */
const DEVANAGARI_CHAR_MAP: Record<string, string> = {
  'अ': 'a',
  'आ': 'aa',
  'इ': 'i',
  'ई': 'ee',
  'उ': 'u',
  'ऊ': 'oo',
  'ऋ': 'ri',
  'ए': 'e',
  'ऐ': 'ai',
  'ओ': 'o',
  'औ': 'au',
  'अं': 'an',
  'अः': 'ah',
  'क': 'k',
  'ख': 'kh',
  'ग': 'g',
  'घ': 'gh',
  'ङ': 'ng',
  'च': 'ch',
  'छ': 'chh',
  'ज': 'j',
  'झ': 'jh',
  'ञ': 'n',
  'ट': 't',
  'ठ': 'th',
  'ड': 'd',
  'ढ': 'dh',
  'ण': 'n',
  'त': 't',
  'थ': 'th',
  'द': 'd',
  'ध': 'dh',
  'न': 'n',
  'प': 'p',
  'फ': 'ph',
  'ब': 'b',
  'भ': 'bh',
  'म': 'm',
  'य': 'y',
  'र': 'r',
  'ल': 'l',
  'व': 'v',
  'श': 'sh',
  'ष': 'sh',
  'स': 's',
  'ह': 'h',
  'ा': 'a',
  'ि': 'i',
  'ी': 'ee',
  'ु': 'u',
  'ू': 'oo',
  'े': 'e',
  'ै': 'ai',
  'ो': 'o',
  'ौ': 'au',
  '्': '',
  'ं': 'n',
  'ः': 'h',
  'ॉ': 'o',
  'ॅ': 'e',
  '़': '',
  '।': '.',
  '॥': '.',
}

/**
 * Transliterate Devanagari Hindi text to Roman Hinglish.
 */
export function devanagariToRomanHinglish(text: string): string {
  if (!hasDevanagari(text)) return text

  let result = text
  for (const [dev, rom] of Object.entries(DEVANAGARI_WORD_MAP)) {
    result = result.split(dev).join(rom)
  }

  let charResult = ''
  for (const char of result) {
    if (DEVANAGARI_CHAR_MAP[char] !== undefined) {
      charResult += DEVANAGARI_CHAR_MAP[char]
    } else if (hasDevanagari(char)) {
      charResult += ''
    } else {
      charResult += char
    }
  }

  return charResult.replace(/[ \t]{2,}/g, ' ').trim()
}

/**
 * Sanitize the AI reply script.
 * If customer input is Roman Hinglish (no Devanagari in customer input)
 * and generated reply contains Devanagari, convert the reply to Roman Hinglish.
 */
export function sanitizeReplyScript(replyText: string, customerInput: string): string {
  if (!replyText) return ''
  const customerHasDevanagari = hasDevanagari(customerInput)
  const replyHasDevanagari = hasDevanagari(replyText)

  if (!customerHasDevanagari && replyHasDevanagari) {
    return devanagariToRomanHinglish(replyText)
  }

  return replyText
}

/**
 * Format message for WhatsApp display:
 * - Ensures 2-4 short paragraphs separated by blank lines (\n\n)
 * - Ensures bullet items (- or •) are on clean new lines
 * - Preserves spacing and prevents wall-of-text collapse
 */
export function formatWhatsAppMessage(text: string): string {
  if (!text) return ''

  let formatted = text.trim()

  formatted = formatted.replace(/([^\n])\n([•\-*]\s+)/g, '$1\n\n$2')
  formatted = formatted.replace(/([•\-*][^\n]+)\n([^\n•\-*])/g, '$1\n\n$2')
  formatted = formatted.replace(/\n{3,}/g, '\n\n')

  return formatted.trim()
}
