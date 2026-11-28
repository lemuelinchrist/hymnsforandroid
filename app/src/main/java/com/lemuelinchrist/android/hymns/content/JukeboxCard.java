package com.lemuelinchrist.android.hymns.content;

import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.preference.PreferenceManager;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.TextView;
import androidx.appcompat.widget.SwitchCompat;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.content.sheetmusic.SheetPlayer;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.style.BookColors;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The inline Jukebox card on the hymn lyrics page, styled in the unified Proposal 1 look shared with the sheet
 * music bottom dock: a 3dp top progress bar, a slim 1-row Play/Style/Loop/Expand/Close bar, and a collapsible
 * drawer with four segmented category tabs (Hymn's own, Piano, Guitar, Melody), a Dice randomizer, horizontal
 * style pills (with attached refresh side-buttons on Flowing, Lively, and Fingerpicking), Chorale More walking
 * switch, and a Tempo slider. Plays through the hidden sheet player ({@link SheetPlayer}) using tools/web/src/jukebox.js.
 */
public class JukeboxCard extends ContentComponent<View> implements SheetPlayer.Listener {
    /** The categories of jukebox.js GROUPS, in its order: group id, label string resource. */
    private static final Object[][] GROUPS = {
            {"own", R.string.jukebox_group_own},
            {"piano", R.string.jukebox_piano},
            {"guitar", R.string.jukebox_guitar},
            {"melody", R.string.jukebox_melody},
    };
    /** The styles of jukebox.js STYLES: style id, group id, label string resource, shuffle flag, walk flag. */
    private static final Object[][] STYLES = {
            {"own", "own", R.string.jukebox_style_own, false, false},
            {"plain", "piano", R.string.jukebox_style_plain, false, false},
            {"chorale", "piano", R.string.jukebox_style_chorale, false, true},
            {"flowing", "piano", R.string.jukebox_style_flowing, true, false},
            {"lively", "piano", R.string.jukebox_style_lively, true, false},
            {"walking", "piano", R.string.jukebox_style_walking, false, false},
            {"guitar-pick", "guitar", R.string.jukebox_style_pick, true, false},
            {"guitar-folk", "guitar", R.string.jukebox_style_folk, false, false},
            {"guitar-pop", "guitar", R.string.jukebox_style_pop, false, false},
            {"guitar-steady", "guitar", R.string.jukebox_style_steady, false, false},
            {"guitar-ballad", "guitar", R.string.jukebox_style_ballad, false, false},
            {"guitar-country", "guitar", R.string.jukebox_style_country, false, false},
            {"melody", "melody", R.string.jukebox_style_melody, false, false},
    };
    // the styles that may be picked at random (as `random: true` in jukebox.js); Plain, Chorale and Melody alone only by hand
    private static final java.util.Set<String> RANDOM_STYLES = new java.util.HashSet<>(java.util.Arrays.asList(
            "flowing", "lively", "walking", "guitar-pick", "guitar-folk",
            "guitar-ballad", "guitar-country"));
    private static final String DEFAULT_STYLE = "own", FALLBACK_STYLE = "flowing";
    private static final String PREF_LOOP = "jukeboxLoop";
    private static final double MIN_SPEED = 0.5, STEP = 0.05;
    private static final int DEFAULT_BPM = 110;
    private static final Pattern BPM = Pattern.compile("midi\\.bpm=\"([0-9.]+)\"");

    private final String sheetId;
    private final SharedPreferences prefs;
    private final Random random = new Random();
    private final Map<String, TextView> categoryTabs = new HashMap<>();
    private ImageButton playButton, loopButton, expandButton;
    private TextView currentText, subText, tempoText;
    private ProgressBar progress;
    private LinearLayout categoryRow, substyleRow;
    private View cardView, drawerView, drawerDivider, subScroll;
    private SeekBar speedBar;
    private SwitchCompat walkSwitch;
    private PlayStateListener playStateListener;
    private int accent, cardBg, badgeBg, textCol, mutedCol, mutedStroke, accentSoft;
    private int bpm = DEFAULT_BPM;
    private int curBar = 0, curBars = 0;
    private int seed = 0;
    private boolean playing, loopOn = true, expanded = true, moreWalk = false;
    private boolean hasOwn;
    private String style;

    public JukeboxCard(Hymn hymn, Fragment parentFragment, View card) {
        super(hymn, parentFragment, card);
        prefs = PreferenceManager.getDefaultSharedPreferences(context);
        sheetId = hymn.getSheetToPlay();
        card.setVisibility(View.GONE);
        if (sheetId == null) return;
        String head = hymn.getSheetHead(sheetId);
        hasOwn = head != null && head.contains("type=\"hands\"");
        bpm = tempoOf(head);
        setUp(card);
    }

    /** Told when the card starts or stops playing (the page's Play button follows it). */
    public interface PlayStateListener {
        void onPlayingChanged(boolean playing);
    }

    public boolean isAvailable() {
        return sheetId != null;
    }

    public void setPlayStateListener(PlayStateListener l) {
        playStateListener = l;
    }

    /** The page's Play button: shows the card and plays in it; while it plays, stops it (the card stays). */
    public void togglePlay() {
        if (sheetId == null) return;
        if (playing) {
            SheetPlayer.get(context).stop();
            return;
        }
        cardView.setVisibility(View.VISIBLE);
        start();
    }

    /** The X: stops the music and takes the card away until Play is pressed again. */
    private void close() {
        if (playing) SheetPlayer.get(context).stop();
        cardView.setVisibility(View.GONE);
    }

    private void setUp(View card) {
        cardView = card;
        accent = BookColors.accent(context, hymn.getHymnGroup());
        cardBg = BookColors.color(context, R.attr.hymnCardBackground);
        badgeBg = BookColors.color(context, R.attr.hymnBadgeBackground);
        textCol = BookColors.color(context, R.attr.hymnText);
        mutedCol = BookColors.color(context, R.attr.hymnTextMuted);
        mutedStroke = withAlpha(mutedCol, 0x38);
        accentSoft = withAlpha(accent, 0x22);
        ColorStateList accentList = ColorStateList.valueOf(accent);

        playButton = card.findViewById(R.id.jukeboxPlay);
        playButton.setBackgroundTintList(accentList);
        playButton.setImageTintList(ColorStateList.valueOf(cardBg));
        playButton.setOnClickListener(v -> {
            if (playing) SheetPlayer.get(context).stop();
            else start();
        });

        currentText = card.findViewById(R.id.jukeboxCurrent);
        subText = card.findViewById(R.id.jukeboxSub);
        drawerView = card.findViewById(R.id.jukeboxDrawer);
        drawerDivider = card.findViewById(R.id.jukeboxDrawerDivider);
        drawerView.setBackgroundColor(withAlpha(badgeBg, 0x77));

        View meta = card.findViewById(R.id.jukeboxMeta);
        expandButton = card.findViewById(R.id.jukeboxExpand);
        View.OnClickListener toggleExpand = v -> setExpanded(!expanded);
        meta.setOnClickListener(toggleExpand);
        expandButton.setOnClickListener(toggleExpand);

        loopOn = prefs.getBoolean(PREF_LOOP, true);
        loopButton = card.findViewById(R.id.jukeboxLoop);
        loopButton.setOnClickListener(v -> {
            loopOn = !loopOn;
            prefs.edit().putBoolean(PREF_LOOP, loopOn).apply();
            updateLoopButton();
            updateSubtitle();
            if (playing) start();
        });
        updateLoopButton();

        ImageButton closeButton = card.findViewById(R.id.jukeboxClose);
        closeButton.setImageTintList(ColorStateList.valueOf(mutedCol));
        closeButton.setOnClickListener(v -> close());

        categoryRow = card.findViewById(R.id.jukeboxCategories);
        categoryRow.setBackground(roundedRect(badgeBg, dp(11), 0, 0));
        subScroll = card.findViewById(R.id.jukeboxSubScroll);
        substyleRow = card.findViewById(R.id.jukeboxSubstyles);

        // a hymn opens on its own style; one without goes to Piano with a style chosen at random
        style = hasOwn ? DEFAULT_STYLE : FALLBACK_STYLE;
        if (stylesInGroup(groupOf(style)).size() > 1) style = randomIn(groupOf(style), null);

        categoryRow.removeAllViews();
        categoryTabs.clear();
        for (Object[] g : GROUPS) {
            String gid = (String) g[0];
            if ("own".equals(gid) && !hasOwn) continue;
            TextView tab = new TextView(context);
            tab.setText(context.getString((Integer) g[1]));
            tab.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
            tab.setGravity(Gravity.CENTER);
            tab.setSingleLine(true);
            tab.setEllipsize(TextUtils.TruncateAt.END);
            tab.setMinHeight(dp(32));
            tab.setPadding(dp(6), dp(5), dp(6), dp(5));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            tab.setLayoutParams(lp);
            tab.setOnClickListener(v -> {
                if (!gid.equals(groupOf(style))) chooseStyle(randomStyleOf(gid), 0);
            });
            categoryTabs.put(gid, tab);
            categoryRow.addView(tab);
        }

        ColorStateList track = ColorStateList.valueOf(withAlpha(mutedCol, 0x33));
        progress = card.findViewById(R.id.jukeboxProgress);
        progress.setProgressTintList(accentList);
        progress.setProgressBackgroundTintList(track);

        tempoText = card.findViewById(R.id.jukeboxTempo);
        speedBar = card.findViewById(R.id.jukeboxSpeed);
        speedBar.setProgressTintList(accentList);
        speedBar.setThumbTintList(accentList);
        speedBar.setProgressBackgroundTintList(track);
        speedBar.setProgress(stepOf(1));
        speedBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int step, boolean fromUser) {
                showTempo();
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {
            }

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {
                if (playing) start();
            }
        });
        tempoText.setOnClickListener(v -> {
            speedBar.setProgress(stepOf(1));
            showTempo();
            if (playing) start();
        });

        walkSwitch = card.findViewById(R.id.jukeboxWalk);
        int[][] states = {{android.R.attr.state_checked}, {}};
        walkSwitch.setThumbTintList(new ColorStateList(states, new int[]{accent, mutedCol}));
        walkSwitch.setTrackTintList(new ColorStateList(states, new int[]{withAlpha(accent, 0x66), withAlpha(mutedCol, 0x44)}));
        walkSwitch.setOnCheckedChangeListener((b, on) -> {
            moreWalk = on;
            renderHeaderTitle();
            if (playing) start();
        });

        setExpanded(true);
        renderStyles();
        showTempo();
        showStopped();
    }

    private void setExpanded(boolean on) {
        expanded = on;
        drawerView.setVisibility(on ? View.VISIBLE : View.GONE);
        drawerDivider.setVisibility(on ? View.VISIBLE : View.GONE);
        expandButton.setRotation(on ? 0f : 180f);
        expandButton.setImageTintList(ColorStateList.valueOf(on ? accent : mutedCol));
        expandButton.setBackground(on ? circleButton(accentSoft, 0) : null);
    }

    private void updateLoopButton() {
        loopButton.setImageTintList(ColorStateList.valueOf(loopOn ? accent : mutedCol));
        loopButton.setBackground(loopOn ? circleButton(accentSoft, 0) : null);
    }

    private void chooseStyle(String chosen, int newSeed) {
        if (chosen == null) return;
        Object[] row = styleRow(chosen);
        if (row == null) return;
        boolean canShuffle = (Boolean) row[3];
        int nextSeed = canShuffle ? newSeed : 0;
        if (chosen.equals(style) && nextSeed == seed) return;
        style = chosen;
        seed = nextSeed;
        renderStyles();
        if (playing) start();
    }

    private void renderHeaderTitle() {
        Object[] cur = styleRow(style);
        if (cur == null) return;
        StringBuilder sb = new StringBuilder(context.getString((Integer) cur[2]));
        if ((Boolean) cur[4] && moreWalk) {
            sb.append(" · ").append(context.getString(R.string.jukebox_more_walking));
        }
        if ((Boolean) cur[3] && seed > 0) {
            sb.append(" · ").append(context.getString(R.string.jukebox_shuffled));
        }
        currentText.setText(sb.toString());
    }

    private void updateSubtitle() {
        StringBuilder sb = new StringBuilder(context.getString(R.string.jukebox_tempo, Math.round(bpm * speed())));
        if (loopOn) sb.append(" · ").append(context.getString(R.string.jukebox_loop));
        if (playing && curBar > 0 && curBars > 0) {
            sb.append(" · ").append(context.getString(R.string.jukebox_bar, curBar, curBars));
        }
        subText.setText(sb.toString());
    }

    private void renderStyles() {
        Object[] cur = styleRow(style);
        if (cur == null) return;
        String activeGroup = (String) cur[1];
        renderHeaderTitle();

        for (Map.Entry<String, TextView> e : categoryTabs.entrySet()) {
            boolean on = e.getKey().equals(activeGroup);
            TextView tv = e.getValue();
            tv.setTextColor(on ? accent : mutedCol);
            tv.setTypeface(Typeface.create(on ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
            tv.setBackground(on ? roundedRect(cardBg, dp(8), 0, 0) : null);
        }

        List<Object[]> subs = stylesInGroup(activeGroup);
        substyleRow.removeAllViews();
        if (subs.size() > 1) {
            subScroll.setVisibility(View.VISIBLE);
            for (int i = 0; i < subs.size(); i++) {
                Object[] s = subs.get(i);
                String sid = (String) s[0];
                String label = context.getString((Integer) s[2]);
                boolean on = sid.equals(style);
                boolean canShuffle = (Boolean) s[3];
                View chip = canShuffle ? makeSplitChip(sid, label, on) : makeChip(sid, label, on);
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                if (i > 0) lp.setMarginStart(dp(6));
                substyleRow.addView(chip, lp);
            }
        } else {
            subScroll.setVisibility(View.GONE);
        }

        boolean showWalk = (Boolean) cur[4];
        walkSwitch.setVisibility(showWalk ? View.VISIBLE : View.GONE);
        if (showWalk) walkSwitch.setChecked(moreWalk);
    }

    private View makeChip(String sid, String label, boolean selected) {
        TextView tv = new TextView(context);
        tv.setText(label);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        tv.setGravity(Gravity.CENTER);
        tv.setSingleLine(true);
        tv.setMinHeight(dp(34));
        tv.setPadding(dp(13), dp(6), dp(13), dp(6));
        tv.setTextColor(selected ? cardBg : textCol);
        tv.setTypeface(Typeface.create(selected ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
        tv.setBackground(ripple(roundedRect(selected ? accent : cardBg, dp(999), dp(1), selected ? accent : mutedStroke), dp(999)));
        tv.setOnClickListener(v -> chooseStyle(sid, 0));
        return tv;
    }

    private View makeSplitChip(String sid, String label, boolean selected) {
        LinearLayout wrap = new LinearLayout(context);
        wrap.setOrientation(LinearLayout.HORIZONTAL);
        wrap.setGravity(Gravity.CENTER_VERTICAL);
        wrap.setBackground(roundedRect(selected ? accent : cardBg, dp(999), dp(1), selected ? accent : mutedStroke));
        wrap.setClipToOutline(true);

        TextView main = new TextView(context);
        main.setText(label);
        main.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        main.setGravity(Gravity.CENTER);
        main.setSingleLine(true);
        main.setMinHeight(dp(34));
        main.setPadding(dp(13), dp(6), dp(9), dp(6));
        main.setTextColor(selected ? cardBg : textCol);
        main.setTypeface(Typeface.create(selected ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
        main.setBackground(ripple(null, 0));
        main.setOnClickListener(v -> chooseStyle(sid, 0));

        View divider = new View(context);
        divider.setLayoutParams(new LinearLayout.LayoutParams(dp(1), dp(22)));
        divider.setBackgroundColor(selected ? withAlpha(cardBg, 0x55) : mutedStroke);

        ImageButton side = new ImageButton(context);
        side.setLayoutParams(new LinearLayout.LayoutParams(dp(34), dp(34)));
        side.setPadding(dp(9), dp(9), dp(9), dp(9));
        side.setScaleType(ImageView.ScaleType.FIT_CENTER);
        side.setImageResource(R.drawable.ic_refresh_24dp);
        side.setImageTintList(ColorStateList.valueOf(selected ? cardBg : mutedCol));
        side.setBackground(ripple(null, 0));
        side.setContentDescription(context.getString(R.string.jukebox_shuffle));
        side.setOnClickListener(v -> chooseStyle(sid, 1 + random.nextInt(99999)));

        wrap.addView(main);
        wrap.addView(divider);
        wrap.addView(side);
        return wrap;
    }

    private GradientDrawable roundedRect(int fill, float radius, int strokeWidth, int strokeColor) {
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.RECTANGLE);
        d.setCornerRadius(radius);
        d.setColor(fill);
        if (strokeWidth > 0) d.setStroke(strokeWidth, strokeColor);
        return d;
    }

    private RippleDrawable circleButton(int fill, int stroke) {
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(fill);
        if (stroke != 0) bg.setStroke(dp(1), stroke);
        return ripple(bg, dp(999));
    }

    private RippleDrawable ripple(GradientDrawable content, float maskRadius) {
        GradientDrawable mask = new GradientDrawable();
        mask.setShape(GradientDrawable.RECTANGLE);
        mask.setCornerRadius(maskRadius);
        mask.setColor(Color.WHITE);
        return new RippleDrawable(ColorStateList.valueOf(withAlpha(accent, 0x33)), content, mask);
    }

    private static String groupOf(String styleId) {
        Object[] row = styleRow(styleId);
        return row == null ? "" : (String) row[1];
    }

    private String randomStyleOf(String gid) {
        List<Object[]> subs = stylesInGroup(gid);
        return subs.isEmpty() ? null : randomIn(gid, null);
    }

    private String randomIn(String gid, String not) {
        List<Object[]> pool = new ArrayList<>();
        for (Object[] s : stylesInGroup(gid)) if (!s[0].equals(not) && RANDOM_STYLES.contains(s[0])) pool.add(s);
        if (pool.isEmpty()) for (Object[] s : stylesInGroup(gid)) if (!s[0].equals(not)) pool.add(s);
        if (pool.isEmpty()) pool = stylesInGroup(gid);
        return (String) pool.get(random.nextInt(pool.size()))[0];
    }

    private static Object[] styleRow(String id) {
        for (Object[] s : STYLES) if (s[0].equals(id)) return s;
        return null;
    }

    private static List<Object[]> stylesInGroup(String gid) {
        List<Object[]> out = new ArrayList<>();
        for (Object[] s : STYLES) if (gid.equals(s[1])) out.add(s);
        return out;
    }

    private int dp(float value) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, value, context.getResources().getDisplayMetrics()));
    }

    /** Plays, or, while it plays, goes on from the same bar with what the card shows now. */
    private void start() {
        if (!playing) {
            logToHistory();
            PlayButton.stopCurrentlyPlayingButton();
        }
        Object[] cur = styleRow(style);
        boolean walk = cur != null && (Boolean) cur[4] && moreWalk;
        SheetPlayer.get(context).play(sheetId, new SheetPlayer.Options(style, loopOn, speed(), seed, walk), this);
        playing = true;
        playButton.setImageResource(R.drawable.ic_stop_24dp);
        playButton.setContentDescription(context.getString(R.string.jukebox_stop));
        updateSubtitle();
        if (playStateListener != null) playStateListener.onPlayingChanged(true);
    }

    @Override
    public void onSheetStopped() {
        playing = false;
        showStopped();
    }

    @Override
    public void onSheetBar(int bar, int bars) {
        if (!playing) return;
        curBar = bar;
        curBars = bars;
        progress.setMax(Math.max(1, bars));
        progress.setProgress(bar);
        updateSubtitle();
    }

    private void showStopped() {
        curBar = 0;
        curBars = 0;
        playButton.setImageResource(R.drawable.ic_play_arrow_white_48dp);
        playButton.setContentDescription(context.getString(R.string.jukebox_play));
        progress.setProgress(0);
        updateSubtitle();
        if (playStateListener != null) playStateListener.onPlayingChanged(false);
    }

    private void showTempo() {
        tempoText.setText(context.getString(R.string.jukebox_tempo, Math.round(bpm * speed())));
        updateSubtitle();
    }

    private double speed() {
        return MIN_SPEED + STEP * speedBar.getProgress();
    }

    private static int stepOf(double speed) {
        return (int) Math.max(0, Math.min(20, Math.round((speed - MIN_SPEED) / STEP)));
    }

    private static int tempoOf(String head) {
        double bpm = DEFAULT_BPM;
        if (head != null) {
            Matcher m = BPM.matcher(head);
            if (m.find()) {
                try {
                    double b = Double.parseDouble(m.group(1));
                    if (b > 0) bpm = b;
                } catch (NumberFormatException ignored) {
                }
            }
        }
        while (bpm > 250) bpm /= 2;
        while (bpm < 40) bpm *= 2;
        return (int) Math.round(bpm);
    }

    private static int withAlpha(int color, int alpha) {
        return (color & 0x00FFFFFF) | (alpha << 24);
    }
}
