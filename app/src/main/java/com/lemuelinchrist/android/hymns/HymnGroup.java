package com.lemuelinchrist.android.hymns;

import android.content.Context;
import android.graphics.Color;
import android.view.Gravity;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Created by lemuelcantos on 18/8/13.
 */
public enum HymnGroup {
    E("English", Color.rgb(0x3D, 0x57, 0x7A),
            Color.rgb(0xB0, 0xBE, 0xC5),
            Gravity.LEFT),
    // Green
    C("Chinese (Traditional)", Color.rgb(0x66, 0x99, 0x00),
            Color.rgb(0xA5, 0xD6, 0xA7),
            Gravity.LEFT),
    //Purple
    CS("Chinese Supplement (Traditional)", Color.rgb(0x99, 0x33, 0xCC),
            Color.rgb(0xCE, 0x93, 0xD8),
            Gravity.LEFT),
    // Green
    Z("Chinese (Simplified)", Color.rgb(0x66, 0x99, 0x00),
            Color.rgb(0xA5, 0xD6, 0xA7),
            Gravity.LEFT),
    //Purple
    ZS("Chinese Supplement (Simplified)", Color.rgb(0x99, 0x33, 0xCC),
            Color.rgb(0xCE, 0x93, 0xD8),
            Gravity.LEFT),
    //Orange
    CB("Cebuano", Color.rgb(0xFF, 0x88, 0x00),
            Color.rgb(0xFF, 0xCC, 0x80),
            Gravity.LEFT),
    //Teal
    T("Tagalog", Color.rgb(0x00, 0x96, 0x88),
            Color.rgb(0x80, 0xCB, 0xC4),
            Gravity.LEFT),
    //Pink
    FR("French", Color.rgb(0xE9, 0x1E, 0x63),
            Color.rgb(0xF4, 0x8F, 0xB1),
            Gravity.LEFT),
    //Pink, like French (youth books share their language's colours: SY, GY)
    FRY("French Youth", Color.rgb(0xE9, 0x1E, 0x63),
            Color.rgb(0xF4, 0x8F, 0xB1),
            Gravity.LEFT),
    //Indigo
    S("Spanish", Color.rgb(0x3F, 0x51, 0xB5),
            Color.rgb(0x9F, 0xA8, 0xDA),
            Gravity.LEFT),
    //Indigo
    SY("Spanish Youth", Color.rgb(0x3F, 0x51, 0xB5),
            Color.rgb(0x9F, 0xA8, 0xDA),
            Gravity.LEFT),
    //Brown
    K("Korean", Color.rgb(0x79, 0x55, 0x48),
            Color.rgb(0xBC, 0xAA, 0xA4),
            Gravity.LEFT),
    //Deep Orange
    G("German", Color.rgb(0xFF, 0x57, 0x22),
            Color.rgb(0xFF, 0xAB, 0x91),
            Gravity.LEFT),
    //Deep Orange
    GY("German Youth", Color.rgb(0xFF, 0x57, 0x22),
            Color.rgb(0xFF, 0xAB, 0x91),
            Gravity.LEFT),
    //Light Green
    J("Japanese",Color.rgb(0x8B,0xC3,0x4A),
            Color.rgb(0xAE,0xD5,0x81),
            Gravity.LEFT),
    // Red
    I("Indonesian",Color.rgb(0xF4,0x43,0x36),
            Color.rgb(0xE5,0x73,0x73),
            Gravity.LEFT),
    //Blue
    BF("Be Filled", Color.rgb(0x00, 0x99, 0xCC),
            Color.rgb(0x90, 0xCA, 0xF9),
            Gravity.LEFT),
    //Red
    NS("New Songs", Color.rgb(0xCC, 0x00, 0x00),
            Color.rgb(0xEF, 0x9A, 0x9A),
            Gravity.LEFT),
    //Lime
    CH("Children", Color.rgb(0xAF, 0xB4, 0x2B),
            Color.rgb(0xE6, 0xEE, 0x9C),
            Gravity.LEFT),
    //Deep Purple
    F("Farsi", Color.rgb(0x67, 0x3A, 0xB7),
            Color.rgb(0xB3, 0x9D, 0xDB),
            Gravity.RIGHT),
    // Purple
    SK("Slovak", Color.rgb(0x9C, 0x27, 0xB0),
            Color.rgb(0xCE, 0x93, 0xD8),
            Gravity.LEFT),
    //Light Blue
    GK("Greek", Color.rgb(0x03, 0xA9, 0xF4),
            Color.rgb(0x4F, 0xC3, 0xF7),
            Gravity.LEFT),
    //Cyan
    SW("Kiswahili", Color.rgb(0x00, 0x83, 0x8F),
            Color.rgb(0x4D, 0xD0, 0xE1),
            Gravity.LEFT),
    //Dark Blue
    RUS("Russian", Color.rgb(0x15, 0x65, 0xC0),
            Color.rgb(0x64, 0xB5, 0xF6),
            Gravity.LEFT),
    //Dark Green
    BUR("Burmese", Color.rgb(0x2E, 0x7D, 0x32),
            Color.rgb(0x66, 0xBB, 0x6A),
            Gravity.LEFT),
    //Blue Grey
    TA("Tamil", Color.rgb(0x54, 0x6E, 0x7A),
            Color.rgb(0x90, 0xA4, 0xAE),
            Gravity.LEFT),
    //Burgundy (Pink 900 / Pink 300), right to left like Farsi
    UR("Urdu", Color.rgb(0x88, 0x0E, 0x4F),
            Color.rgb(0xF0, 0x62, 0x92),
            Gravity.RIGHT),
    //Amber (Amber 900 / Amber 600)
    KI("Kikuyu", Color.rgb(0xFF, 0x6F, 0x00),
            Color.rgb(0xFF, 0xB3, 0x00),
            Gravity.LEFT),
    //Light Green 900 / Light Green 600: the first books with a three-letter code (2026-11)
    POR("Portuguese", Color.rgb(0x33, 0x69, 0x1E),
            Color.rgb(0x7C, 0xB3, 0x42),
            Gravity.LEFT),
    //Light Green, like Portuguese (youth books share their language's colours: SY, GY, FRY)
    POY("Portuguese Youth", Color.rgb(0x33, 0x69, 0x1E),
            Color.rgb(0x7C, 0xB3, 0x42),
            Gravity.LEFT),
    //Deep Purple 600 / Deep Purple 200
    POL("Polish", Color.rgb(0x5E, 0x35, 0xB1),
            Color.rgb(0xB3, 0x9D, 0xDB),
            Gravity.LEFT);

    private final String simpleName;
    // taken from Google Color Palette #500
    private final int dayColor;
    // taken from Google color palette #200 - https://material.io/guidelines/style/color.html#color-color-palette
    private final int nightColor;

    public static final String DEFAULT_HYMN_NUMBER="E1";
    private final int textAlignment;

    public int getNightColor() {
        return nightColor;
    }

    /** The longest book code (the letters before the number): 1 to {@value} letters (E, CS, POR). */
    public static final int MAX_CODE_LENGTH = 3;

    /** How many letters start the id: its book code ("E1" 1, "CS12" 2, "POR1360" 3); the number begins with a digit. */
    private static int codeLength(String hymnId) {
        int n = 0;
        while (n < hymnId.length() && n < MAX_CODE_LENGTH && Character.isLetter(hymnId.charAt(n))) n++;
        return n;
    }

    /**
     * The codes that three books had before 2026-11 (Burmese MY, Russian R, French Youth FY), so that an old favorites
     * backup, an old link or what someone types still finds the hymn: MY637 is BUR637.
     */
    private static final Map<String, String> OLD_CODES = new HashMap<>();
    static {
        OLD_CODES.put("MY", "BUR");
        OLD_CODES.put("R", "RUS");
        OLD_CODES.put("FY", "FRY");
    }

    /** The code of a book (any case, or one of the old codes) as the book's current code; null if there is no such book. */
    public static String currentCode(String code) {
        String upper = code == null ? "" : code.toUpperCase();
        if (OLD_CODES.containsKey(upper)) return OLD_CODES.get(upper);
        try {
            return valueOf(upper).name();
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /** The hymn ID with its book's current code ("MY637" -> "BUR637", "e1" -> "E1"); the ID unchanged when its book is unknown. */
    public static String currentId(String hymnId) {
        if (hymnId == null || hymnId.isEmpty()) return hymnId;
        int n = codeLength(hymnId);
        String code = currentCode(hymnId.substring(0, n));
        return code == null ? hymnId : code + hymnId.substring(n);
    }

    public static HymnGroup getHymnGroupFromID(String hymnId) throws NoSuchHymnGroupException {
        //split hymn group from hymn number
        String code = currentCode(hymnId.substring(0, codeLength(hymnId)));
        if (code == null) throw new NoSuchHymnGroupException("No Such Hymn Group: " + hymnId);
        return valueOf(code);
    }

    public static String getHymnNoFromID(String hymnId) {
        //split hymn group from hymn number
        return hymnId.substring(codeLength(hymnId));
    }

    /**
     * The hymn someone starts on before they have opened any (an empty history): the first hymn of the book in the
     * app's language, the string first_hymn (E1; C1 in Traditional Chinese, Z1 in Simplified Chinese). Someone who
     * has a history goes on where they were, whatever the language.
     */
    public static String firstHymn(Context context) {
        String id = context.getString(R.string.first_hymn);
        return currentCode(id.substring(0, codeLength(id))) == null ? DEFAULT_HYMN_NUMBER : id;
    }

    public static HymnGroup getDefaultHymnGroup() {
        return HymnGroup.getHymnGroupFromID(DEFAULT_HYMN_NUMBER);
    }

    public int getDayColor() {
        return dayColor;
    }

    /** The language of the book ("English" for Be Filled, New Songs and Children; "Chinese" for all four Chinese books;
     *  the youth books and supplements are in their main language). Labels a link a hymn inherits from another language. */
    public String getLanguage() {
        if (this == E || this == BF || this == NS || this == CH) return "English";
        return simpleName.replaceAll(" \\(.*\\)$", "").replace(" Supplement", "").replace(" Youth", "");
    }

    /** The English name of the book ("Chinese (Traditional)"); what the user sees is {@link #getDisplayName}. */
    public String getSimpleName() {
        return simpleName;
    }

    /**
     * The name of the book in the app's language: the string book_&lt;code&gt; ("book_c"), English when it has no
     * translation. Be Filled and New Songs keep their English names in every language.
     */
    public String getDisplayName(Context context) {
        return text(context, "book_" + name(), simpleName);
    }

    /** The name of the book in its own language ("Español", "中文 (繁)"), the same whatever the app's language. */
    public String getNativeName(Context context) {
        return text(context, "native_" + name(), simpleName);
    }

    /**
     * The line under the book's own name in the drawer and the books dialog: its name in the app's language and the
     * number of hymns ("Spanish · 910 hymns"), only the number when the two names are the same ("English" in English).
     */
    public String getSubtitle(Context context, String hymnCount) {
        String name = getDisplayName(context);
        // a book in the app's own language needs no translation of its name: "中文 (繁)" in Chinese, "English" in English
        if (name.equals(getNativeName(context)) || isInLanguage(context.getString(R.string.ui_language))) return hymnCount;
        return hymnCount == null ? name : context.getString(R.string.book_subtitle, name, hymnCount);
    }

    /**
     * The language of the book in the app's language (the string language_&lt;code of its main book&gt;): "English"
     * for Be Filled, New Songs and Children, "Chinese" for the four Chinese books. Labels a link a hymn inherits.
     */
    public String getLanguageName(Context context) {
        return text(context, "language_" + languageBook().name(), getLanguage());
    }

    /** Whether the book is in the language of this language tag ("zh-Hant": the four Chinese books). */
    boolean isInLanguage(String languageTag) {
        String language = languageTag.split("-")[0];
        switch (languageBook()) {
            case E: return language.equals("en");
            case C: return language.equals("zh");
            case S: return language.equals("es");
            case FR: return language.equals("fr");
            case G: return language.equals("de");
            case POR: return language.equals("pt");
            default: return false;
        }
    }

    /** The main book of the book's language: E for BF, NS and CH, C for the Chinese books, S for SY and so on. */
    public HymnGroup languageBook() {
        switch (this) {
            case BF: case NS: case CH: return E;
            case CS: case Z: case ZS: return C;
            case FRY: return FR;
            case SY: return S;
            case GY: return G;
            case POY: return POR;
            default: return this;
        }
    }

    private static String text(Context context, String name, String english) {
        int id = context.getResources().getIdentifier(name.toLowerCase(Locale.ROOT), "string", context.getPackageName());
        return id == 0 ? english : context.getString(id);
    }

    HymnGroup(String simpleName, int dayColor, int nightColor, int textAlignment) {
        this.nightColor=nightColor;
        this.simpleName = simpleName;
        this.dayColor = dayColor;
        this.textAlignment = textAlignment;

    }
    public static String[] getArrayOfSimpleNames() {
        List<String> list = new ArrayList<String>();
        for (HymnGroup group: HymnGroup.values()) {
            list.add(group.getSimpleName());

        }
        return list.toArray(new String[list.size()]);
    }

    public static String[] getArrayOfCodes() {
        List<String> list = new ArrayList<String>();
        for (HymnGroup group: HymnGroup.values()) {
            list.add(group.name());

        }
        return list.toArray(new String[list.size()]);
    }


    public int getTextAlignment() {
        return textAlignment;
    }

    public boolean isBigHymnLanguage() {
        switch (this) {
            case NS:
            case BF:
            case CH:
                return false;
            default:
                return true;
        }
    }
}
