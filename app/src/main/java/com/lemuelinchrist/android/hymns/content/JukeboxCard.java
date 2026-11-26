package com.lemuelinchrist.android.hymns.content;

import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.preference.PreferenceManager;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.TextView;
import androidx.appcompat.widget.SwitchCompat;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.content.sheetmusic.SheetPlayer;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.style.BookColors;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The JUKEBOX card under the details: plays the hymn's sheet music in a style picked from a list (the hymn's own; Piano:
 * Flowing, Plain, Chorale, Lively, Walking; Guitar: seven strums and pickings; Melody alone), with Play, Loop and the
 * tempo, and shows the bar it is at. It plays through the hidden sheet player ({@link SheetPlayer}), whose page makes the
 * notes with the web app's own jukebox (tools/web/src/jukebox.js), so the two apps sound the same. A change while it
 * plays goes on from the same bar. A hymn opens on its sheet's own style (Flowing when it names none); a style picked is
 * for this page only. Loop (on to begin with) and the tempo are kept for every hymn. The card is hidden for a hymn with
 * nothing to play (no sheet, or a sheet of chords only). One sound at a time: it stops the hymn's Play button, and
 * the Play button (or another page) stops it.
 */
public class JukeboxCard extends ContentComponent<View> implements SheetPlayer.Listener {
    /** The styles of jukebox.js STYLES, in its order: its id, the heading it is under (0: none), its name. */
    private static final Object[][] STYLES = {
            {"own", 0, R.string.jukebox_style_own},
            {"flowing", R.string.jukebox_piano, R.string.jukebox_style_flowing},
            {"plain", R.string.jukebox_piano, R.string.jukebox_style_plain},
            {"chorale", R.string.jukebox_piano, R.string.jukebox_style_chorale},
            {"lively", R.string.jukebox_piano, R.string.jukebox_style_lively},
            {"walking", R.string.jukebox_piano, R.string.jukebox_style_walking},
            {"guitar-folk", R.string.jukebox_guitar, R.string.jukebox_style_folk},
            {"guitar-pop", R.string.jukebox_guitar, R.string.jukebox_style_pop},
            {"guitar-steady", R.string.jukebox_guitar, R.string.jukebox_style_steady},
            {"guitar-ballad", R.string.jukebox_guitar, R.string.jukebox_style_ballad},
            {"guitar-country", R.string.jukebox_guitar, R.string.jukebox_style_country},
            {"guitar-pick", R.string.jukebox_guitar, R.string.jukebox_style_pick},
            {"guitar-arp", R.string.jukebox_guitar, R.string.jukebox_style_arp},
            {"melody", 0, R.string.jukebox_style_melody},
    };
    private static final String DEFAULT_STYLE = "own", FALLBACK_STYLE = "flowing";   // as jukebox.js
    private static final String PREF_LOOP = "jukeboxLoop", PREF_SPEED = "jukeboxSpeed";
    // the tempo: half to one and a half times the sheet's, by twentieths (as the viewer's Play); the seek bar's 10 is 1
    private static final double MIN_SPEED = 0.5, STEP = 0.05;
    private static final int DEFAULT_BPM = 110;
    private static final Pattern BPM = Pattern.compile("midi\\.bpm=\"([0-9.]+)\"");

    private final String sheetId;
    private final SharedPreferences prefs;
    private final List<String> styleIds = new ArrayList<>();
    private ImageButton playButton;
    private Spinner styleSpinner;
    private ProgressBar progress;
    private TextView barText, tempoText;
    private SeekBar speedBar;
    private SwitchCompat loopSwitch;
    private int bpm = DEFAULT_BPM;
    private boolean playing;
    private String style;   // the one shown

    public JukeboxCard(Hymn hymn, Fragment parentFragment, View card) {
        super(hymn, parentFragment, card);
        prefs = PreferenceManager.getDefaultSharedPreferences(context);
        sheetId = hymn.getSheetToPlay();
        if (sheetId == null) {
            card.setVisibility(View.GONE);
            return;
        }
        String head = hymn.getSheetHead(sheetId);
        boolean own = head != null && head.contains("type=\"hands\"");
        bpm = tempoOf(head);
        setUp(card, own);
    }

    private void setUp(View card, boolean own) {
        int accent = BookColors.accent(context, hymn.getHymnGroup());
        ColorStateList accentList = ColorStateList.valueOf(accent);

        playButton = card.findViewById(R.id.jukeboxPlay);
        playButton.setBackgroundTintList(accentList);
        // the icon in the card's colour: white on the day accent, dark on the lighter night one
        playButton.setImageTintList(ColorStateList.valueOf(BookColors.color(context, R.attr.hymnCardBackground)));
        playButton.setOnClickListener(v -> {
            if (playing) SheetPlayer.get(context).stop();   // tells this card (onSheetStopped)
            else start();
        });

        // the list: the hymn's own style only for a sheet that names one; a style under a heading shows it ("Piano · Flowing")
        List<String> names = new ArrayList<>();
        for (Object[] s : STYLES) {
            if (s[0].equals("own") && !own) continue;
            styleIds.add((String) s[0]);
            String name = context.getString((Integer) s[2]);
            int group = (Integer) s[1];
            names.add(group == 0 ? name : context.getString(R.string.jukebox_in_group, context.getString(group), name));
        }
        ArrayAdapter<String> adapter = new ArrayAdapter<>(context, R.layout.jukebox_style_item, names);
        adapter.setDropDownViewResource(R.layout.jukebox_style_dropdown);
        styleSpinner = card.findViewById(R.id.jukeboxStyle);
        styleSpinner.setAdapter(adapter);
        style = styleIds.contains(DEFAULT_STYLE) ? DEFAULT_STYLE : FALLBACK_STYLE;
        styleSpinner.setSelection(styleIds.indexOf(style), false);
        styleSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                String chosen = styleIds.get(position);
                if (chosen.equals(style)) return;   // the first call, or no change
                style = chosen;
                if (playing) start();
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
            }
        });

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
        speedBar.setProgress(stepOf(prefs.getFloat(PREF_SPEED, 1f)));
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
        prefs.edit().putFloat(PREF_SPEED, (float) speed()).apply();
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
