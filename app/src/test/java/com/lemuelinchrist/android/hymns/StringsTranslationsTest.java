package com.lemuelinchrist.android.hymns;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.xml.parsers.DocumentBuilderFactory;

import org.junit.Test;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * The translations (values-b+zh+Hant, values-b+zh+Hans, values-es) against the English strings.xml:
 * no string that English does not have (a renamed or removed one left behind), and the same %1$s / %2$d placeholders
 * in every string, since a missing or swapped one crashes or garbles a dialog only in that language. A string that is
 * not translated yet is allowed (it shows in English); strings marked translatable="false" are not to be translated.
 */
public class StringsTranslationsTest {
    private static final File RES = new File("src/main/res");
    private static final String[] LANGUAGES = {"values-b+zh+Hant", "values-b+zh+Hans", "values-es"};
    private static final Pattern PLACEHOLDER = Pattern.compile("%(\\d+)\\$[sd]");

    /** name -> text, for strings, string-array items ("name[0]") and plurals ("name:other"), and the untranslatable names */
    private static Map<String, String> read(File file, List<String> untranslatable) throws Exception {
        Map<String, String> out = new TreeMap<>();
        Element root = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file).getDocumentElement();
        NodeList nodes = root.getChildNodes();
        for (int i = 0; i < nodes.getLength(); i++) {
            if (!(nodes.item(i) instanceof Element)) continue;
            Element e = (Element) nodes.item(i);
            String name = e.getAttribute("name");
            if ("false".equals(e.getAttribute("translatable"))) {
                if (untranslatable != null) untranslatable.add(name);
                continue;
            }
            if (e.getTagName().equals("string")) {
                out.put(name, e.getTextContent());
            } else {
                NodeList items = e.getElementsByTagName("item");
                for (int k = 0; k < items.getLength(); k++) {
                    Element item = (Element) items.item(k);
                    String key = e.getTagName().equals("plurals") ? name + ":" + item.getAttribute("quantity") : name + "[" + k + "]";
                    out.put(key, item.getTextContent());
                }
            }
        }
        return out;
    }

    private static Map<String, String> english() throws Exception {
        Map<String, String> all = new TreeMap<>();
        for (String file : new String[]{"strings.xml", "arrays.xml"}) all.putAll(read(new File(RES, "values/" + file), null));
        return all;
    }

    private static TreeSet<String> placeholders(String text) {
        TreeSet<String> found = new TreeSet<>();
        Matcher m = PLACEHOLDER.matcher(text);
        while (m.find()) found.add(m.group());
        return found;
    }

    @Test
    public void everyTranslationHasOnlyStringsEnglishHasWithTheSamePlaceholders() throws Exception {
        Map<String, String> english = english();
        assertTrue("English strings not found at " + RES.getAbsolutePath(), english.size() > 100);
        List<String> problems = new ArrayList<>();
        for (String language : LANGUAGES) {
            for (String file : new String[]{"strings.xml", "arrays.xml"}) {
                File f = new File(RES, language + "/" + file);
                if (!f.exists()) continue;
                for (Map.Entry<String, String> e : read(f, null).entrySet()) {
                    String key = e.getKey();
                    // the plural forms a language has that English does not (one/many/other): compare with English "other"
                    String base = english.containsKey(key) ? key : key.contains(":") ? key.replaceAll(":.*", ":other") : key;
                    if (!english.containsKey(base)) {
                        problems.add(language + ": " + key + " is not in the English strings");
                        continue;
                    }
                    // the singular form of a plural may leave the number out ("the hymn"), the others must have all
                    if (key.endsWith(":one") && placeholders(e.getValue()).isEmpty()) continue;
                    if (!placeholders(e.getValue()).equals(placeholders(english.get(base)))) {
                        problems.add(language + ": " + key + " has " + placeholders(e.getValue()) + ", English has "
                                + placeholders(english.get(base)));
                    }
                }
            }
        }
        assertEquals(problems.toString(), 0, problems.size());
    }

    @Test
    public void everyLanguageNamesItselfAndStartsOnItsOwnFirstHymn() throws Exception {
        String[][] expected = {{"values-b+zh+Hant", "zh-Hant", "C1"}, {"values-b+zh+Hans", "zh-Hans", "Z1"},
                {"values-es", "es", "S1"}};
        for (String[] e : expected) {
            Map<String, String> strings = read(new File(RES, e[0] + "/strings.xml"), null);
            assertEquals(e[0], e[1], strings.get("ui_language"));
            assertEquals(e[0], e[2], strings.get("first_hymn"));
            String book = e[2].replaceAll("[0-9]+$", "");
            assertEquals(e[0], book, HymnGroup.currentCode(book));
        }
    }

    @Test
    public void everyBookHasANativeNameAndADisplayNameInEveryLanguage() throws Exception {
        List<String> untranslatable = new ArrayList<>();
        read(new File(RES, "values/strings.xml"), untranslatable);
        List<String> missing = new ArrayList<>();
        for (HymnGroup group : HymnGroup.values()) {
            String code = group.name().toLowerCase();
            if (!untranslatable.contains("native_" + code)) missing.add("native_" + code);
            for (String language : LANGUAGES) {
                Map<String, String> strings = read(new File(RES, language + "/strings.xml"), null);
                // Be Filled and New Songs keep their English names, so they are never translated
                boolean fixed = untranslatable.contains("book_" + code);
                if (!fixed && !strings.containsKey("book_" + code)) missing.add(language + " book_" + code);
            }
        }
        assertEquals("books without a name: " + missing, Arrays.asList(), missing);
    }
}
