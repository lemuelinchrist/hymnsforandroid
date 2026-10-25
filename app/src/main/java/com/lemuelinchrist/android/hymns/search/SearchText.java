package com.lemuelinchrist.android.hymns.search;

import java.text.Normalizer;

/**
 * The search form of a text: no markup, no accents, lower case, only letters, marks and digits, words separated by
 * single spaces. Must give the same as norm() in tools/web/build.py and tools/web/src/db.js.
 *
 * <p>Written as one pass over the text because the phone runs it on every stanza (11 MB) after each update.
 *
 * @since 2026-10-23
 */
public final class SearchText {

    private SearchText() {
    }

    public static String norm(String text) {
        if (text == null || text.isEmpty()) return "";
        if (mayHaveAccents(text)) text = removeAccents(text);

        StringBuilder out = new StringBuilder(text.length());
        boolean space = true;
        int n = text.length();
        for (int i = 0; i < n; ) {
            char c = text.charAt(i);
            boolean word;
            int cp;
            if (c < 0x80) {
                if (c == '<') {
                    // markup: a comment, or a tag such as <br/>
                    int end = text.startsWith("<!--", i) ? text.indexOf("-->", i + 4) : text.indexOf('>', i + 1);
                    if (end >= 0) {
                        i = end + (text.charAt(end) == '>' ? 1 : 3);
                        if (!space) {
                            out.append(' ');
                            space = true;
                        }
                        continue;
                    }
                }
                // &nbsp; and &amp; are word breaks, not the letters "nbsp" and "amp"
                if (c == '&' && (text.startsWith("&nbsp;", i) || text.startsWith("&amp;", i))) {
                    i += text.charAt(i + 1) == 'n' ? 6 : 5;
                    if (!space) {
                        out.append(' ');
                        space = true;
                    }
                    continue;
                }
                cp = c >= 'A' && c <= 'Z' ? c + 32 : c;
                word = cp >= 'a' && cp <= 'z' || cp >= '0' && cp <= '9';
                i++;
            } else {
                cp = Character.toLowerCase(text.codePointAt(i));
                i += Character.charCount(text.codePointAt(i));
                if (cp == '\u03C2') cp = '\u03C3'; // final sigma
                word = isWordChar(cp);
            }
            if (word) {
                out.appendCodePoint(cp);
                space = false;
            } else if (!space) {
                out.append(' ');
                space = true;
            }
        }
        int end = out.length();
        if (end > 0 && out.charAt(end - 1) == ' ') out.setLength(end - 1);
        return out.toString();
    }

    // Only letters of these blocks decompose into accents U+0300-U+036F (Latin, the accents themselves, Greek,
    // Cyrillic, Latin and Greek extended, symbols like the "not equal" sign). English, Chinese, Korean, Tamil... skip
    // the slow normalization, which would not change them.
    private static boolean mayHaveAccents(String text) {
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c >= 'À' && c <= 'ӿ' || c >= 'Ḁ' && c <= '⿿') return true;
        }
        return false;
    }

    private static String removeAccents(String text) {
        String decomposed = Normalizer.normalize(text, Normalizer.Form.NFD);
        StringBuilder out = new StringBuilder(decomposed.length());
        for (int i = 0; i < decomposed.length(); i++) {
            char c = decomposed.charAt(i);
            if (c < '̀' || c > 'ͯ') out.append(c);
        }
        return Normalizer.normalize(out, Normalizer.Form.NFC);
    }

    // Unicode categories L*, M* and N*, like [\p{L}\p{M}\p{N}] in db.js
    private static boolean isWordChar(int cp) {
        switch (Character.getType(cp)) {
            case Character.UPPERCASE_LETTER:
            case Character.LOWERCASE_LETTER:
            case Character.TITLECASE_LETTER:
            case Character.MODIFIER_LETTER:
            case Character.OTHER_LETTER:
            case Character.NON_SPACING_MARK:
            case Character.COMBINING_SPACING_MARK:
            case Character.ENCLOSING_MARK:
            case Character.DECIMAL_DIGIT_NUMBER:
            case Character.LETTER_NUMBER:
            case Character.OTHER_NUMBER:
                return true;
            default:
                return false;
        }
    }
}
