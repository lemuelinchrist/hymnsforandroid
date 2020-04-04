package com.lemuelinchrist.android.hymns.content;

import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.preference.PreferenceManager;
import android.text.Html;
import android.util.Log;
import android.util.TypedValue;
import android.view.LayoutInflater;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.view.ViewGroup.LayoutParams;
import android.graphics.drawable.ColorDrawable;
import android.graphics.Color;
import android.view.Gravity;
import android.view.ContextThemeWrapper;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.widget.NestedScrollView;
import androidx.fragment.app.Fragment;
import androidx.viewpager.widget.ViewPager;

import com.lemuelinchrist.android.hymns.HymnBookCollection;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.HymnsActivity;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.entities.Stanza;
import com.lemuelinchrist.android.hymns.search.SearchActivity;
import com.lemuelinchrist.android.hymns.style.HymnTextFormatter;
import com.lemuelinchrist.android.hymns.style.Theme;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/**
 * @author Lemuel Cantos
 * @since 22/2/2020
 */
public class LyricsArea extends ContentComponent<NestedScrollView> {
    private final TextView subjectHeader;
    private final ViewGroup stanzaView;
    private final TextView composerView;
    private final TextView lyricHeader;
    //private final Button hymnLink;
    private final SharedPreferences sharedPreferences;
    private final Theme theme;
    private int columnNo=0;
    private LinearLayout currentTextLinearLayout;
    private static float fontSize;
    private static float fontSize1;
    protected HymnGroup selectedHymnGroup = HymnGroup.E;
    protected final int SEARCH_REQUEST = 1;
    private Drawable drawable;
    private LinearLayout layoutRelated;
    public LyricsArea(Hymn hymn, Fragment parentFragment, NestedScrollView view) {
        super(hymn, parentFragment, view);
        // Load saved data
        sharedPreferences = PreferenceManager.getDefaultSharedPreferences(parentFragment.getContext());
        fontSize = Float.parseFloat(sharedPreferences.getString("FontSize", "18f"));
        fontSize1 = Float.parseFloat(sharedPreferences.getString("FontSize", "10f"));
        theme = Theme.isNightModePreferred(sharedPreferences.getBoolean("nightMode", false));

        // remove placeholder because it only contains dummy lyrics
        stanzaView = view.findViewById(getRid("stanzaView"));
        stanzaView.removeView(stanzaView.getChildAt(0));

        subjectHeader = view.findViewById(getRid("subjectHeader"));
        subjectHeader.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize);

        lyricHeader = view.findViewById(getRid("lyricHeader"));
        lyricHeader.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize);

        composerView = view.findViewById(getRid("composer"));
        composerView.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize);
        layoutRelated = view.findViewById(getRid("layoutRelated"));
    }
    public HymnGroup getHymnGroup(String hymnNo) {
        try {
            selectedHymnGroup = HymnGroup.getHymnGroupFromID(hymnNo);
        } catch (com.lemuelinchrist.android.hymns.NoSuchHymnGroupException e) {
            Log.e(this.getClass().getName(),e.getMessage());
        }
        return selectedHymnGroup;
    }
    private void selectDrawerItem() {
        //Log.i(HymnsActivity.class.getSimpleName(), "Drawer Item selected: " + position);
        //getHymnGroup();
        if (selectedHymnGroup == null) {
            Log.w(HymnsActivity.class.getSimpleName(), "warning: selected Hymn group currently not supported. Switching to default group: E");
            selectedHymnGroup = HymnGroup.E;
        }

        ((HymnsActivity)parentFragment.getContext()).hymnBookCollection.translateTo(selectedHymnGroup);

    }
    private int getRid(String lyricHeader) {
        return parentFragment.getContext().getResources().getIdentifier(lyricHeader, "id", parentFragment.getContext()
                .getPackageName());
    }

    @RequiresApi(api = Build.VERSION_CODES.JELLY_BEAN)
    public void displayLyrics() {
        try {
            Log.d(this.getClass().getSimpleName(), "Displaying lyrics");

            //if hymn is still null, it means the user entered a hymn number that doesn't exist
            if (hymn == null) return;

            // ########################### Build Header
            boolean headerContentPresent=false;
            StringBuilder text = new StringBuilder();
            if (isNotEmpty(hymn.getMainCategory())) {
                headerContentPresent=true;
                text.append("<b>" + hymn.getMainCategory() + "</b>");
            }
            if (isNotEmpty(hymn.getSubCategory())) {
                headerContentPresent=true;
                text.append("<br/>" + hymn.getSubCategory());
            }
            if (hymn.isNewTune()) text.append("<br/>(New Tune)");
            subjectHeader.setText(Html.fromHtml(text.toString()));

            text = new StringBuilder();
            // **** tune header
            if (isNotEmpty(hymn.getMeter())) {
                headerContentPresent=true;
                text.append("<br/>Meter: ");
                text.append(hymn.getMeter());
            }
            if (isNotEmpty(hymn.getTime())) {
                headerContentPresent=true;
                text.append("<br/>Time: ");
                text.append(hymn.getTime());
            }
            if (isNotEmpty(hymn.getKey())) {
                headerContentPresent=true;
                text.append(" - " + hymn.getKey());
            }
            if (isNotEmpty(hymn.getVerse())) {
                headerContentPresent=true;
                text.append("<br/>Verses: ");
                text.append(hymn.getVerse());
            }

            // ** build related
            List<String> related = hymn.getRelated();
            if (related != null && related.size() != 0) {
                headerContentPresent=true;
                //text.append("<br/>Related: ");
                StringBuilder relatedConcat = new StringBuilder();
                for (String r : related) {
                    relatedConcat.append(", ");
                    relatedConcat.append(r);
                    if (getHymnGroup(r) == HymnGroup.ML) {
                        int buttonStyle = R.style.Large;

                        Button hymnLink = new Button(new ContextThemeWrapper(parentFragment.getContext(), buttonStyle),
                                null, buttonStyle);
                        hymnLink.setBackground(parentFragment.getContext().getResources()
                                .getDrawable(R.drawable.rounded));
                        hymnLink.setOnClickListener(new View.OnClickListener() {
                            public void onClick(View v) {
                                selectDrawerItem();
                            }
                        });
                        hymnLink.setText(Html.fromHtml(r));
                        hymnLink.setGravity(Gravity.CENTER);
                        hymnLink.setTextColor(Color.parseColor("#FFFFFF"));
                        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(150,
                                70);
                        hymnLink.setLayoutParams(params);
                        layoutRelated.addView(hymnLink);
                    }
                    if (getHymnGroup(r) == HymnGroup.E) {
                        int buttonStyle = R.style.Large;

                        Button hymnLink = new Button(new ContextThemeWrapper(parentFragment.getContext(), buttonStyle),
                                null, buttonStyle);
                        //Button hymnLink = new Button(parentFragment.getContext());
                        hymnLink.setOnClickListener(new View.OnClickListener() {
                            public void onClick(View v) {
                                selectDrawerItem();
                            }
                        });
                        hymnLink.setBackground(parentFragment.getContext().getResources()
                                .getDrawable(R.drawable.rounded_english));

                        hymnLink.setText(Html.fromHtml(r));
                        hymnLink.setGravity(Gravity.CENTER);
                        hymnLink.setTextColor(Color.parseColor("#FFFFFF"));
                        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(150,
                                70);
                        hymnLink.setLayoutParams(params);
                        layoutRelated.addView(hymnLink);
                    }
                    if (getHymnGroup(r) == HymnGroup.BF) {
                        int buttonStyle = R.style.Large;

                        Button hymnLink = new Button(new ContextThemeWrapper(parentFragment.getContext(), buttonStyle),
                                null, buttonStyle);
                        View view = new View(parentFragment.getContext());
                        LinearLayout.LayoutParams params1 = new LinearLayout.LayoutParams(10,
                                LayoutParams.WRAP_CONTENT);
                        params1.weight = 1;
                        view.setLayoutParams(params1);
                        hymnLink.setOnClickListener(new View.OnClickListener() {
                            public void onClick(View v) {
                                selectDrawerItem();
                            }
                        });
                        hymnLink.setBackground(parentFragment.getContext().getResources()
                                .getDrawable(R.drawable.rounded_button));
                        hymnLink.setText(Html.fromHtml(r));
                        ColorDrawable cd = new ColorDrawable(Color.parseColor("#FFFFFF"));
                        hymnLink.setGravity(Gravity.CENTER);
                        hymnLink.setTextColor(Color.parseColor("#FFFFFF"));
                        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(150,
                                70);
                        hymnLink.setLayoutParams(params);
                        layoutRelated.addView(hymnLink);
                        layoutRelated.addView(view);
                    }
                    if (getHymnGroup(r) == HymnGroup.NS) {
                        int buttonStyle = R.style.Large;

                        Button hymnLink = new Button(new ContextThemeWrapper(parentFragment.getContext(), buttonStyle),
                                null, buttonStyle);
                        View view = new View(parentFragment.getContext());
                        LinearLayout.LayoutParams params1 = new LinearLayout.LayoutParams(10,
                                LayoutParams.WRAP_CONTENT);
                        params1.weight = 1;
                        view.setLayoutParams(params1);
                        hymnLink.setOnClickListener(new View.OnClickListener() {
                            public void onClick(View v) {
                                selectDrawerItem();
                            }
                        });
                        hymnLink.setBackground(parentFragment.getContext().getResources()
                                .getDrawable(R.drawable.rounded_button));
                        hymnLink.setText(Html.fromHtml(r));
                        ColorDrawable cd = new ColorDrawable(Color.parseColor("#FFFFFF"));
                        hymnLink.setGravity(Gravity.CENTER);
                        hymnLink.setTextColor(Color.parseColor("#FFFFFF"));
                        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(150,
                                70);
                        hymnLink.setLayoutParams(params);
                        layoutRelated.addView(hymnLink);
                        layoutRelated.addView(view);
                    }
                }

               // if (relatedConcat.length() > 2)
                  //  text.append(relatedConcat.substring(2));
            }

            if(!headerContentPresent) {
                View mainHeaderContainer = view.findViewById(getRid("mainHeaderContainer"));
                mainHeaderContainer.setVisibility(View.GONE);
            } else {
                // Use text.substring to remove the leading <br/>
                if(!text.toString().equals("")) {
                    lyricHeader.setText(Html.fromHtml(text.substring(5)));
                }
                else {
                    lyricHeader.setText(Html.fromHtml(""));
                }
            }

            // ######################## Build Lyric Text

            String chorusText = "";
            text = new StringBuilder();
            ArrayList<Stanza> stanzas = hymn.getStanzas();
            if(stanzas.get(0).getNo().equals("beginning-note")) {
                text.append("<i>" + stanzas.get(0).getText() + "</i><br/>");
                stanzas.remove(stanzas.get(0));
            }
            for (Stanza stanza : stanzas) {
                Log.d(this.getClass().getSimpleName(), "Looping stanza: " + stanza.getNo());
                if (stanza.getNo().equals("chorus")) {
//                    text.append("<b>##" + stanza.getNo() + "##</b><br/>");
                    if (stanza.getNote() != null)
                        text.append("<i>@@(" + stanza.getNote() + ")@@</i>");
                    chorusText = "<i>@@" + stanza.getText() + "@@</i>";
                    text.append(chorusText);
                    buildLyricViewAndAttach(text, hymn.getGroup());
                } else if (stanza.getNo().equals("end-note") || stanza.getNo().equals("note")) {
                    text.append("<i>" + stanza.getText() + "</i>");
                    buildLyricViewAndAttach(text, hymn.getGroup());
                } else {
                    // append stanza
                    text.append("<b>##" + stanza.getNo() + "##</b><br/>");
                    text.append(stanza.getText());
                    buildLyricViewAndAttach(text, hymn.getGroup());

                    // append chorus after every stanza
                    if (hymn.getChorusCount() == 1 && !chorusText.isEmpty()) {
                        buildLyricViewAndAttach(new StringBuilder(chorusText), hymn.getGroup());
                    }
                }
                text = new StringBuilder();
            }

            // remove unused textview if uneven
            // if column is odd
            if (columnNo % 2 != 0) {
                currentTextLinearLayout.removeViewAt(1);
            }

            // #################### Build Footer
            text = new StringBuilder();
            if(isNotEmpty(hymn.getAuthor()) || isNotEmpty(hymn.getComposer())) {
                text.append("Author: " + hymn.getAuthor() + "<br/>");
                text.append("Composer: " + hymn.getComposer());
                composerView.setText(Html.fromHtml(text.toString()));
            } else {
                ((ViewGroup)composerView.getParent()).removeView(composerView);
            }

        } catch (Exception e) {
            e.printStackTrace();
            Log.e(this.getClass().getSimpleName(), "Exception Thrown!!");
            Log.e(this.getClass().getSimpleName(), e.toString());
        }

    }

    private void buildLyricViewAndAttach(StringBuilder text, String selectedHymnGroup) {
        Log.i(this.getClass().getSimpleName(), text.toString());

        // add colors to text
        CharSequence formattedLyrics = HymnTextFormatter.format(Html.fromHtml(text.toString()), theme.getTextColor(HymnGroup.valueOf(selectedHymnGroup)));

        TextView view;
        // if column is odd
        if (++columnNo % 2 != 0) {
            currentTextLinearLayout = (LinearLayout) LayoutInflater.from(parentFragment.getContext()).inflate(R.layout.stanza_linear_layout, null);
            stanzaView.addView(currentTextLinearLayout);
            // left column on landscape mode
            view = (TextView) currentTextLinearLayout.getChildAt(0);
        } else {
            // right column on landscape mode
            view = (TextView) currentTextLinearLayout.getChildAt(1);
        }
        view.setText(formattedLyrics);

        // stylize...
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize);
        view.setTextColor(theme.getTextColor());
        view.setBackgroundColor(theme.getTextBackgroundColor());
    }

    private boolean isNotEmpty(String string) {
        return string!=null && !string.isEmpty();
    }
}
