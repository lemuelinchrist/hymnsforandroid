package com.lemuelinchrist.android.hymns.settings;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.preference.PreferenceManager;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.logbook.ChordEditsBackup;
import com.lemuelinchrist.android.hymns.logbook.FavoritesBackup;
import com.lemuelinchrist.android.hymns.style.BookColors;
import com.lemuelinchrist.android.hymns.style.Theme;
import io.nayuki.qrcodegen.QrCode;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The Settings screen: one scrolling page of cards where every choice is made on the page itself (text size steps,
 * theme pictures, a Piano/Guitar switch, the hymn page switches), then the hymn books, the favorites and chord edits
 * backups, a QR code to share the app, and a row that opens {@link AboutActivity}.
 * <p>
 * Each control reads and writes the default shared preferences under the keys the rest of the app already reads
 * (FontSize, theme, keepDisplayOn, youtubeSearch, similarTune, sheetMusicType, disableLanguages); the defaults are
 * in {@code xml/root_preferences.xml}, which HymnsActivity loads at start.
 */
public class SettingsActivity extends AppCompatActivity {
    /** Intent extra: open the Hymn Books dialog at once (the drawer's "Languages…" link). */
    public static final String OPEN_HYMN_BOOKS = "openHymnBooks";

    private static final String FONT_SIZE = "FontSize", KEEP_ON = "keepDisplayOn", YOUTUBE = "youtubeSearch",
            SIMILAR = "similarTune", SHEET = "sheetMusicType", PIANO = "pianoSvg", GUITAR = "guitarSvg";
    /** What the QR code points to: the Google Play page, or the web app for iPhone and every other device. */
    static final String PLAY_URL = "https://play.google.com/store/apps/details?id=com.lemuelinchrist.android.hymns";
    static final String WEB_URL = "https://lemuelinchrist.github.io/hymnsforandroid/";
    private static final String STATE_SHARE_WEB = "shareWeb";

    private SharedPreferences prefs;
    private FavoritesBackup favoritesBackup;
    private ChordEditsBackup chordEditsBackup;
    private boolean shareWeb;

    private LinearLayout sizeSteps, themeTiles, bookChips;
    private String[] sizeValues, sizeNames, themeValues, themeNames;
    private SettingsRow booksRow, chordEditsRow;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.settings_activity);
        prefs = PreferenceManager.getDefaultSharedPreferences(this);
        favoritesBackup = new FavoritesBackup(this, added -> {});
        chordEditsBackup = new ChordEditsBackup(this, this::updateChordEditsSummary);
        shareWeb = savedInstanceState != null && savedInstanceState.getBoolean(STATE_SHARE_WEB);

        Toolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);
        ActionBar actionBar = getSupportActionBar();
        if (actionBar != null) {
            actionBar.setDisplayHomeAsUpEnabled(true);
            actionBar.setTitle(R.string.title_activity_settings);
        }

        // Apply window insets to handle edge-to-edge display on Android 15+
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.settings_layout), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            // Top padding for the AppBar so it stays below status bar icons
            findViewById(R.id.appbar).setPadding(0, systemBars.top, 0, 0);
            // Bottom padding for the root layout so content stays above nav bar
            v.setPadding(systemBars.left, 0, systemBars.right, systemBars.bottom);
            return insets;
        });

        bindTextSize();
        bindTheme();
        bindSheetMusic();
        bindSwitch(R.id.youtubeRow, YOUTUBE);
        bindSwitch(R.id.similarRow, SIMILAR);
        bindSwitch(R.id.keepOnRow, KEEP_ON);
        bindBooks();
        findViewById(R.id.favoritesRow).setOnClickListener(v -> favoritesBackup.showMenu());
        chordEditsRow = findViewById(R.id.chordEditsRow);
        chordEditsRow.setOnClickListener(v -> chordEditsBackup.showMenu());
        bindShare();
        findViewById(R.id.aboutRow).setOnClickListener(v -> startActivity(new Intent(this, AboutActivity.class)));

        if (savedInstanceState == null && getIntent().getBooleanExtra(OPEN_HYMN_BOOKS, false)) {
            showBooksDialog();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putBoolean(STATE_SHARE_WEB, shareWeb);
    }

    // the count changes when a sheet opened from the list is edited, or after an import
    @Override
    protected void onResume() {
        super.onResume();
        updateChordEditsSummary();
    }

    private void updateChordEditsSummary() {
        chordEditsRow.setSummary(chordEditsBackup.summary());
    }

    // ---- text size: five steps ----

    private void bindTextSize() {
        sizeValues = getResources().getStringArray(R.array.font_size_values);
        sizeNames = getResources().getStringArray(R.array.font_size);
        sizeSteps = findViewById(R.id.sizeSteps);
        for (int i = 0; i < sizeValues.length; i++) {
            final int index = i;
            TextView step = new TextView(this);
            step.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f));
            step.setText("A");
            step.setGravity(Gravity.CENTER);
            step.setTextSize(13 + 4 * i);
            step.setTypeface(step.getTypeface(), android.graphics.Typeface.BOLD);
            step.setTextColor(ContextCompat.getColorStateList(this, R.color.settings_choice_text));
            step.setBackgroundResource(R.drawable.settings_step_bg);
            step.setContentDescription(sizeNames[i]);
            step.setOnClickListener(v -> {
                prefs.edit().putString(FONT_SIZE, sizeValues[index]).apply();
                showTextSize();
            });
            sizeSteps.addView(step);
        }
        showTextSize();
    }

    private void showTextSize() {
        String current = prefs.getString(FONT_SIZE, "18f");
        int selected = Math.max(0, Arrays.asList(sizeValues).indexOf(current));
        for (int i = 0; i < sizeSteps.getChildCount(); i++) sizeSteps.getChildAt(i).setSelected(i == selected);
        ((TextView) findViewById(R.id.textSizeValue)).setText(sizeNames[selected]);
    }

    // ---- theme: a picture per choice ----

    private void bindTheme() {
        themeValues = getResources().getStringArray(R.array.theme_preference_values);
        themeNames = getResources().getStringArray(R.array.theme_preference);
        int[] shortNames = {R.string.theme_tile_system, R.string.theme_tile_light, R.string.theme_tile_dark, R.string.theme_tile_black};
        int[] mocks = {R.drawable.settings_mock_system, R.drawable.settings_mock_light,
                R.drawable.settings_mock_dark, R.drawable.settings_mock_black};
        themeTiles = findViewById(R.id.themeTiles);
        for (int i = 0; i < themeValues.length; i++) {
            final String value = themeValues[i];
            View tile = LayoutInflater.from(this).inflate(R.layout.settings_theme_tile, themeTiles, false);
            tile.findViewById(R.id.tileMock).setBackgroundResource(mocks[i]);
            ((TextView) tile.findViewById(R.id.tileLabel)).setText(shortNames[i]);
            tile.setContentDescription(themeNames[i]);
            tile.setOnClickListener(v -> {
                prefs.edit().putString(Theme.PREFERENCE, value).commit();
                // a new choice changes the night mode at once; the open screens are made again in it
                Theme.apply(this, value);
                showTheme();
            });
            themeTiles.addView(tile);
        }
        showTheme();
    }

    private void showTheme() {
        String current = Theme.choice(this);
        int selected = Math.max(0, Arrays.asList(themeValues).indexOf(current));
        for (int i = 0; i < themeTiles.getChildCount(); i++) {
            View tile = themeTiles.getChildAt(i);
            tile.setSelected(i == selected);
            tile.findViewById(R.id.tileFrame).setSelected(i == selected);
        }
        ((TextView) findViewById(R.id.themeValue)).setText(themeNames[selected]);
    }

    // ---- sheet music: Piano or Guitar ----

    private void bindSheetMusic() {
        findViewById(R.id.sheetPiano).setOnClickListener(v -> chooseSheet(PIANO));
        findViewById(R.id.sheetGuitar).setOnClickListener(v -> chooseSheet(GUITAR));
        showSheet();
    }

    private void chooseSheet(String type) {
        prefs.edit().putString(SHEET, type).apply();
        showSheet();
    }

    private void showSheet() {
        boolean guitar = GUITAR.equals(prefs.getString(SHEET, PIANO));
        findViewById(R.id.sheetPiano).setSelected(!guitar);
        findViewById(R.id.sheetGuitar).setSelected(guitar);
    }

    // ---- the switches ----

    private void bindSwitch(int rowId, final String key) {
        SettingsRow row = findViewById(rowId);
        row.setChecked(prefs.getBoolean(key, false));
        row.setOnCheckedChangeListener((r, checked) -> prefs.edit().putBoolean(key, checked).apply());
    }

    // ---- hymn books ----

    private void bindBooks() {
        booksRow = findViewById(R.id.booksRow);
        bookChips = new LinearLayout(this);
        bookChips.setOrientation(LinearLayout.HORIZONTAL);
        booksRow.addBeforeTrailing(bookChips);
        booksRow.setOnClickListener(v -> showBooksDialog());
        showBooks();
    }

    private Set<String> hiddenBooks() {
        return new HashSet<>(prefs.getStringSet(HymnBooksDialog.HIDDEN_KEY,
                new HashSet<>(Arrays.asList(getResources().getStringArray(R.array.disabled_languages_default)))));
    }

    private void showBooksDialog() {
        HymnBooksDialog.show(this, hiddenBooks(), newHidden -> {
            prefs.edit().putStringSet(HymnBooksDialog.HIDDEN_KEY, newHidden).apply();
            showBooks();
        });
    }

    private void showBooks() {
        Set<String> hidden = hiddenBooks();
        HymnGroup[] all = HymnGroup.values();
        int shown = 0;
        bookChips.removeAllViews();
        float density = getResources().getDisplayMetrics().density;
        for (HymnGroup group : all) {
            if (hidden.contains(group.name())) continue;
            if (++shown > 3) continue;
            TextView chip = new TextView(this);
            int size = (int) (26 * density);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(size, size);
            if (shown > 1) params.setMarginStart((int) (-7 * density));
            chip.setLayoutParams(params);
            chip.setGravity(Gravity.CENTER);
            chip.setText(group.name());
            chip.setTextSize(9.5f);
            chip.setTextColor(Color.WHITE);
            chip.setTypeface(chip.getTypeface(), android.graphics.Typeface.BOLD);
            GradientDrawable background = (GradientDrawable) ContextCompat.getDrawable(this, R.drawable.settings_chip).mutate();
            background.setColor(BookColors.accent(this, group));
            chip.setBackground(background);
            bookChips.addView(chip);
        }
        int hiddenCount = 0;
        StringBuilder names = new StringBuilder();
        for (HymnGroup group : all) {
            if (!hidden.contains(group.name())) continue;
            hiddenCount++;
            if (names.length() > 0) names.append(getString(R.string.list_separator));
            names.append(group.getDisplayName(this));
        }
        String summary;
        if (hiddenCount == 0) summary = getString(R.string.books_all_shown, all.length);
        else if (hiddenCount <= 2) summary = getString(R.string.books_hiding, names);
        else summary = getString(R.string.books_some_shown, all.length - hiddenCount, all.length);
        booksRow.setSummary(summary);
        ((TextView) findViewById(R.id.booksValue)).setText(getString(R.string.books_value, all.length - hiddenCount, all.length));
    }

    // ---- share the app ----

    private void bindShare() {
        findViewById(R.id.shareAndroid).setOnClickListener(v -> chooseShare(false));
        findViewById(R.id.shareWeb).setOnClickListener(v -> chooseShare(true));
        findViewById(R.id.shareCopy).setOnClickListener(v -> {
            ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            clipboard.setPrimaryClip(ClipData.newPlainText(getString(R.string.hymnsForAndroid), shareUrl()));
            // Android 13 and later confirm a copy themselves
            if (Build.VERSION.SDK_INT < 33) Toast.makeText(this, R.string.link_copied, Toast.LENGTH_SHORT).show();
        });
        findViewById(R.id.shareSend).setOnClickListener(v -> {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_SUBJECT, getString(R.string.hymnsForAndroid));
            send.putExtra(Intent.EXTRA_TEXT, getString(R.string.hymnsForAndroid) + "\n" + shareUrl());
            startActivity(Intent.createChooser(send, getString(R.string.settings_share_app)));
        });
        showShare();
    }

    private void chooseShare(boolean web) {
        shareWeb = web;
        showShare();
    }

    private String shareUrl() {
        return shareWeb ? WEB_URL : PLAY_URL;
    }

    private void showShare() {
        findViewById(R.id.shareAndroid).setSelected(!shareWeb);
        findViewById(R.id.shareWeb).setSelected(shareWeb);
        ImageView qr = findViewById(R.id.shareQr);
        qr.setImageBitmap(qrBitmap(shareUrl(), (int) (176 * getResources().getDisplayMetrics().density)));
        qr.setContentDescription(getString(R.string.share_qr_for, shareUrl().replace("https://", "")));
        ((TextView) findViewById(R.id.shareUrl)).setText(shareUrl().replace("https://", ""));
        ((TextView) findViewById(R.id.shareNote)).setText(shareWeb ? R.string.share_note_web : R.string.share_note_android);
    }

    /** The QR code as a black and white picture about {@code targetPx} wide, with whole pixels per square so it stays sharp. */
    static Bitmap qrBitmap(String text, int targetPx) {
        QrCode code = QrCode.encodeText(text, QrCode.Ecc.MEDIUM);
        int modules = code.size;
        int scale = Math.max(1, Math.round((float) targetPx / modules));
        int side = modules * scale;
        int[] pixels = new int[side * side];
        for (int y = 0; y < side; y++) {
            for (int x = 0; x < side; x++) {
                pixels[y * side + x] = code.getModule(x / scale, y / scale) ? 0xFF111111 : Color.WHITE;
            }
        }
        return Bitmap.createBitmap(pixels, side, side, Bitmap.Config.ARGB_8888);
    }
}
