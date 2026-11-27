package com.lemuelinchrist.android.hymns.content;

import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.preference.PreferenceManager;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The JUKEBOX card under the details: plays the hymn's sheet music in a style chosen by category (Hymn's own, Piano,
 * Guitar strum, Guitar pick, Melody) and sub-style chips, with Play, Loop and the tempo, and shows the bar it is at.
 * It plays through the hidden sheet player ({@link SheetPlayer}), whose page makes the notes with the web app's own
 * jukebox (tools/web/src/jukebox.js), so the two apps sound the same. A change while it plays goes on from the same
 * bar. A hymn opens on its sheet's own style (Flowing when it names none); a style picked is for this page only. Loop
 * (on to begin with) and the tempo are kept for every hymn. The card is hidden for a hymn with nothing to play (no
 * sheet, or a sheet of chords only). It folds into its title row ({@link CardFold}); folded, it goes on playing.
 */
public class JukeboxCard extends ContentComponent<View> implements SheetPlayer.Listener {
    /** The categories of jukebox.js GROUPS, in its order: group id, label string resource. */
    private static final Object[][] GROUPS = {
            {"own", R.string.jukebox_group_own},
            {"piano", R.string.jukebox_piano},
            {"strum", R.string.jukebox_guitar_strum},
            {"pick", R.string.jukebox_guitar_pick},
            {"melody", R.string.jukebox_melody},
    };
    /** The styles of jukebox.js STYLES, in its order: style id, group id, label string resource. */
    private static final Object[][] STYLES = {
            {"own", "own", R.string.jukebox_style_own},
            {"flowing", "piano", R.string.jukebox_style_flowing},
            {"plain", "piano", R.string.jukebox_style_plain},
            {"chorale", "piano", R.string.jukebox_style_chorale},
            {"lively", "piano", R.string.jukebox_style_lively},
            {"walking", "piano", R.string.jukebox_style_walking},
            {"guitar-folk", "strum", R.string.jukebox_style_folk},
            {"guitar-pop", "strum", R.string.jukebox_style_pop},
            {"guitar-steady", "strum", R.string.jukebox_style_steady},
            {"guitar-ballad", "strum", R.string.jukebox_style_ballad},
            {"guitar-country", "strum", R.string.jukebox_style_country},
            {"guitar-pick", "pick", R.string.jukebox_style_pick},
            {"guitar-travis", "pick", R.string.jukebox_style_travis},
            {"guitar-pick-flow", "pick", R.string.jukebox_style_pick_flow},
            {"guitar-arp", "pick", R.string.jukebox_style_arp},
            {"guitar-harp", "pick", R.string.jukebox_style_harp},
            {"guitar-arp-flow", "pick", R.string.jukebox_style_arp_flow},
            {"melody", "melody", R.string.jukebox_style_melody},
    };
    private static final String DEFAULT_STYLE = "own", FALLBACK_STYLE = "flowing";   // as jukebox.js
    private static final String PREF_LOOP = "jukeboxLoop";
    // the tempo: half to one and a half times the sheet's, by twentieths (as the viewer's Play); the seek bar's 10 is 1
    private static final double MIN_SPEED = 0.5, STEP = 0.05;
    private static final int DEFAULT_BPM = 110;
    private static final Pattern BPM = Pattern.compile("midi\\.bpm=\"([0-9.]+)\"");

    private final String sheetId;
    private final SharedPreferences prefs;
    private final Map<String, String> lastByGroup = new HashMap<>();
    private final Map<String, TextView> categoryPills = new HashMap<>();
    private ImageButton playButton;
    private TextView currentText, barText, tempoText;
    private ProgressBar progress;
    private WrapLayout categoryRow, substyleRow;
    private View subDivider;
    private SeekBar speedBar;
    private SwitchCompat loopSwitch;
    private int accent, cardBg, badgeBg, textCol, mutedStroke;
    private int bpm = DEFAULT_BPM;
    private boolean playing;
    private boolean hasOwn;
    private String style;   // the active style id

    public JukeboxCard(Hymn hymn, Fragment parentFragment, View card) {
        super(hymn, parentFragment, card);
        prefs = PreferenceManager.getDefaultSharedPreferences(context);
        sheetId = hymn.getSheetToPlay();
        if (sheetId == null) {
            card.setVisibility(View.GONE);
            return;
        }
        String head = hymn.getSheetHead(sheetId);
        hasOwn = head != null && head.contains("type=\"hands\"");
        bpm = tempoOf(head);
        setUp(card);
    }

    private void setUp(View card) {
        accent = BookColors.accent(context, hymn.getHymnGroup());
        cardBg = BookColors.color(context, R.attr.hymnCardBackground);
        badgeBg = BookColors.color(context, R.attr.hymnBadgeBackground);
        textCol = BookColors.color(context, R.attr.hymnText);
        mutedStroke = withAlpha(BookColors.color(context, R.attr.hymnTextMuted), 0x44);
        ColorStateList accentList = ColorStateList.valueOf(accent);

        playButton = card.findViewById(R.id.jukeboxPlay);
        playButton.setBackgroundTintList(accentList);
        // the icon in the card's colour: white on the day accent, dark on the lighter night one
        playButton.setImageTintList(ColorStateList.valueOf(cardBg));
        playButton.setOnClickListener(v -> {
            if (playing) SheetPlayer.get(context).stop();   // tells this card (onSheetStopped)
            else start();
        });

        currentText = card.findViewById(R.id.jukeboxCurrent);
        categoryRow = card.findViewById(R.id.jukeboxCategories);
        subDivider = card.findViewById(R.id.jukeboxSubDivider);
        substyleRow = card.findViewById(R.id.jukeboxSubstyles);

        for (Object[] g : GROUPS) {
            String gid = (String) g[0];
            for (Object[] s : STYLES) {
                if (gid.equals(s[1])) {
                    lastByGroup.put(gid, (String) s[0]);
                    break;
                }
            }
        }
        style = hasOwn ? DEFAULT_STYLE : FALLBACK_STYLE;
        Object[] initial = styleRow(style);
        if (initial != null) lastByGroup.put((String) initial[1], style);

        categoryRow.removeAllViews();
        for (Object[] g : GROUPS) {
            String gid = (String) g[0];
            if ("own".equals(gid) && !hasOwn) continue;
            TextView pill = makePill(context.getString((Integer) g[1]), true, false);
            pill.setOnClickListener(v -> chooseStyle(lastByGroup.get(gid)));
            categoryPills.put(gid, pill);
            categoryRow.addView(pill);
        }
        renderPills();

        // the tracks under the coloured parts, in the muted text colour (the theme's own are hardly seen on the card)
        ColorStateList track = ColorStateList.valueOf(BookColors.color(context, R.attr.hymnTextMuted));
        progress = card.findViewById(R.id.jukeboxProgress);
        progress.setProgressTintList(accentList);
        progress.setProgressBackgroundTintList(track);
        barText = card.findViewById(R.id.jukeboxBar);

        tempoText = card.findViewById(R.id.jukeboxTempo);
        speedBar = card.findViewById(R.id.jukeboxSpeed);
        speedBar.setProgressTintList(accentList);
        speedBar.setThumbTintList(accentList);
        speedBar.setProgressBackgroundTintList(track);
        speedBar.setProgress(stepOf(1));   // the tempo is not kept: every hymn starts at its own
        showTempo();
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
                tempoChanged();
            }
        });
        // a tap on the tempo: the sheet's own again
        tempoText.setOnClickListener(v -> {
            speedBar.setProgress(stepOf(1));
            tempoChanged();
        });

        loopSwitch = card.findViewById(R.id.jukeboxLoop);
        loopSwitch.setChecked(prefs.getBoolean(PREF_LOOP, true));
        int off = BookColors.color(context, R.attr.hymnTextMuted);
        int[][] states = {{android.R.attr.state_checked}, {}};
        loopSwitch.setThumbTintList(new ColorStateList(states, new int[]{accent, off}));
        loopSwitch.setTrackTintList(new ColorStateList(states, new int[]{withAlpha(accent, 0x66), withAlpha(off, 0x44)}));
        loopSwitch.setOnCheckedChangeListener((b, on) -> {
            prefs.edit().putBoolean(PREF_LOOP, on).apply();
            if (playing) start();
        });
        showStopped();
        CardFold.attach(context, hymn.getHymnGroup(), card.findViewById(R.id.jukeboxHeader),
                card.findViewById(R.id.jukeboxFold), card.findViewById(R.id.jukeboxBody), CardFold.JUKEBOX);
    }

    private void chooseStyle(String chosen) {
        if (chosen == null || chosen.equals(style)) return;
        Object[] row = styleRow(chosen);
        if (row == null) return;
        style = chosen;
        lastByGroup.put((String) row[1], style);
        renderPills();
        if (playing) start();
    }

    private void renderPills() {
        Object[] cur = styleRow(style);
        if (cur == null) return;
        String activeGroup = (String) cur[1];
        for (Map.Entry<String, TextView> e : categoryPills.entrySet()) {
            applyPillAppearance(e.getValue(), true, e.getKey().equals(activeGroup));
        }
        List<Object[]> subs = stylesInGroup(activeGroup);
        String styleLabel = context.getString((Integer) cur[2]);
        if (subs.size() > 1) {
            int groupLabel = groupLabelRes(activeGroup);
            currentText.setText(groupLabel != 0
                    ? context.getString(R.string.jukebox_in_group, context.getString(groupLabel), styleLabel)
                    : styleLabel);
            subDivider.setVisibility(View.VISIBLE);
            substyleRow.setVisibility(View.VISIBLE);
            substyleRow.removeAllViews();
            for (Object[] s : subs) {
                String sid = (String) s[0];
                TextView chip = makePill(context.getString((Integer) s[2]), false, sid.equals(style));
                chip.setOnClickListener(v -> chooseStyle(sid));
                substyleRow.addView(chip);
            }
        } else {
            currentText.setText(styleLabel);
            subDivider.setVisibility(View.GONE);
            substyleRow.setVisibility(View.GONE);
            substyleRow.removeAllViews();
        }
    }

    private TextView makePill(String text, boolean isCategory, boolean selected) {
        TextView tv = new TextView(context);
        tv.setText(text);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        tv.setGravity(Gravity.CENTER);
        tv.setSingleLine(true);
        tv.setMinHeight(dp(34));
        int padH = dp(12), padV = dp(6);
        tv.setPadding(padH, padV, padH, padV);
        tv.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        applyPillAppearance(tv, isCategory, selected);
        return tv;
    }

    private void applyPillAppearance(TextView tv, boolean isCategory, boolean selected) {
        float radius = dp(999);
        GradientDrawable shape = new GradientDrawable();
        shape.setShape(GradientDrawable.RECTANGLE);
        shape.setCornerRadius(radius);
        if (isCategory) {
            if (selected) {
                shape.setColor(accent);
                tv.setTextColor(cardBg);
            } else {
                shape.setColor(badgeBg);
                shape.setStroke(dp(1), mutedStroke);
                tv.setTextColor(textCol);
            }
            tv.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        } else {
            if (selected) {
                shape.setColor(withAlpha(accent, 0x24));
                shape.setStroke(dp(1), accent);
                tv.setTextColor(accent);
                tv.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
            } else {
                shape.setColor(Color.TRANSPARENT);
                shape.setStroke(dp(1), mutedStroke);
                tv.setTextColor(textCol);
                tv.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
            }
        }
        GradientDrawable mask = new GradientDrawable();
        mask.setShape(GradientDrawable.RECTANGLE);
        mask.setCornerRadius(radius);
        mask.setColor(Color.WHITE);
        tv.setBackground(new RippleDrawable(ColorStateList.valueOf(withAlpha(accent, 0x33)), shape, mask));
        tv.setSelected(selected);
    }

    private static Object[] styleRow(String id) {
        for (Object[] s : STYLES) if (s[0].equals(id)) return s;
        return null;
    }

    private static int groupLabelRes(String gid) {
        for (Object[] g : GROUPS) if (g[0].equals(gid)) return (Integer) g[1];
        return 0;
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
        SheetPlayer.get(context).play(sheetId, new SheetPlayer.Options(style, loopSwitch.isChecked(), speed()), this);
        playing = true;
        playButton.setImageResource(R.drawable.ic_pause_white_48dp);
        playButton.setContentDescription(context.getString(R.string.jukebox_stop));
    }

    @Override
    public void onSheetStopped() {
        playing = false;
        showStopped();
    }

    @Override
    public void onSheetBar(int bar, int bars) {
        if (!playing) return;
        progress.setMax(Math.max(1, bars));
        progress.setProgress(bar);
        barText.setText(context.getString(R.string.jukebox_bar, bar, bars));
    }

    private void showStopped() {
        playButton.setImageResource(R.drawable.ic_play_arrow_white_48dp);
        playButton.setContentDescription(context.getString(R.string.jukebox_play));
        progress.setProgress(0);
        barText.setText("");
    }

    private void tempoChanged() {
        if (playing) start();
    }

    private void showTempo() {
        tempoText.setText(context.getString(R.string.jukebox_tempo, Math.round(bpm * speed())));
    }

    private double speed() {
        return MIN_SPEED + STEP * speedBar.getProgress();
    }

    private static int stepOf(double speed) {
        return (int) Math.max(0, Math.min(20, Math.round((speed - MIN_SPEED) / STEP)));
    }

    /** The tempo the sheet names (midi.bpm), as play.js and jukebox.js read it: brought between 40 and 250. */
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
