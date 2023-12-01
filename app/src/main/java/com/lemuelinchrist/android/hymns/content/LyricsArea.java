package com.lemuelinchrist.android.hymns.content;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.preference.PreferenceManager;
import android.text.Html;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.method.LinkMovementMethod;
import android.text.style.ClickableSpan;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.core.widget.NestedScrollView;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.HymnGroup;
import com.lemuelinchrist.android.hymns.NoSuchHymnGroupException;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.entities.Stanza;
import com.lemuelinchrist.android.hymns.style.HymnTextFormatter;
import com.lemuelinchrist.android.hymns.style.Theme;
import java.util.*;

/**
 * @author Lemuel Cantos
 * @since 22/2/2020
 */
public class LyricsArea extends ContentComponent<NestedScrollView> {
    private final TextView subjectHeader;
    private final ViewGroup stanzaView;
    private final TextView composerView;
    private final TextView lyricHeader;
    private final SharedPreferences sharedPreferences;
    private final Theme theme;
    private int columnNo=0;
    private LinearLayout currentTextLinearLayout;
    private static float fontSize;
    private final Set<String> disabledLanguages;


    public LyricsArea(Hymn hymn, Fragment parentFragment, NestedScrollView view) {
        super(hymn, parentFragment, view);

        // Load saved data
        sharedPreferences = PreferenceManager.getDefaultSharedPreferences(context);
        fontSize = Float.parseFloat(sharedPreferences.getString("FontSize", "18f"));
        theme = Theme.isNightModePreferred(sharedPreferences.getBoolean("nightMode", false));
        disabledLanguages = sharedPreferences.getStringSet("disableLanguages",new HashSet<String>());

        // remove placeholder because it only contains dummy lyrics
        stanzaView = view.findViewById(getRid("stanzaView"));
        stanzaView.removeView(stanzaView.getChildAt(0));

        subjectHeader = view.findViewById(getRid("subjectHeader"));
        subjectHeader.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize);

        lyricHeader = view.findViewById(getRid("lyricHeader"));
        lyricHeader.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize);

        composerView = view.findViewById(getRid("composer"));
        composerView.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize);

    }

    private int getRid(String lyricHeader) {
        return context.getResources().getIdentifier(lyricHeader, "id", context
                .getPackageName());
    }

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
                if(!text.toString().contains("Time: ")) {
                    text.append("<br/>Key: ");
                } else {
                    text.append(" - ");
                }
                text.append(hymn.getKey());
            }
            if (isNotEmpty(hymn.getTune())) {
                headerContentPresent=true;
                text.append("<br/>Tune: ");
                text.append(hymn.getTune());
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
                text.append("<br/>Related: ");
                StringBuilder relatedConcat = new StringBuilder();
                for (String r : related) {
                    // remove languages that are disabled or not supported
                    try {
                        if (disabledLanguages.contains(HymnGroup.getHymnGroupFromID(r).name())) {
                            continue;
                        }
                    } catch (NoSuchHymnGroupException e) {
                        continue;
                    }
                    relatedConcat.append(", ");
                    relatedConcat.append(r);
                }

                if (relatedConcat.length() > 2)
                    text.append(relatedConcat.substring(2));
            }

            if(!headerContentPresent) {
                View mainHeaderContainer = view.findViewById(getRid("mainHeaderContainer"));
                mainHeaderContainer.setVisibility(View.GONE);
            } else {
                // Use text.substring to remove the leading <br/>
                String header;
                if(text.length()>5) {
                    header = text.substring(5);
                } else {
                    header = "";
                }
                lyricHeader.setText(Html.fromHtml(header));
            }

            // ######################## Build Lyric Text

            String chorusText = "";
            text = new StringBuilder();
            ArrayList<Stanza> stanzas = hymn.getStanzas();
            for (Stanza stanza : stanzas) {
                Log.d(this.getClass().getSimpleName(), "Looping stanza: " + stanza.getNo());
                if (stanza.getNo().equals("chorus")) {
                    if (isNotEmpty(stanza.getNote()))
                        text.append("<i>@@(" + stanza.getNote() + ")@@</i>");
                    if(hymn.getHymnGroup().getTextAlignment()== Gravity.RIGHT) {
                        // no italics for right to left languages
                        chorusText = "@@" + stanza.getText() + "@@";
                    } else {
                        chorusText = "<i>@@" + stanza.getText() + "@@</i>";
                    }
                    text.append(chorusText);
                    buildLyricViewAndAttach(text, hymn.getHymnGroup(), false,false);
                    text = new StringBuilder();
                } else if (stanza.getNo().contains("note")) {
                    // notes do not have their own lyric view unlike normal stanzas and choruses
                    text.append("<i>" + stanza.getText() + "</i><br/>");
                } else if(stanza.getNo().toLowerCase().contains("youtube") ||
                        stanza.getNo().toLowerCase().contains("soundcloud")) {
                    // append stanza
                    text.append(stanza.getText().trim() + "\n");
                    buildLyricViewAndAttach(text, hymn.getHymnGroup(), false,true);
                    text = new StringBuilder();
                } else {
                    // append stanza
                    text.append("<b>##" + stanza.getNo() + "##</b><br/>");
                    text.append(stanza.getText());
                    buildLyricViewAndAttach(text, hymn.getHymnGroup(), false,false);
                    text = new StringBuilder();


                    // append chorus after every stanza
                    if (hymn.getChorusCount() == 1 && !chorusText.isEmpty()) {
                        buildLyricViewAndAttach(new StringBuilder(chorusText), hymn.getHymnGroup(),
                                false,false);
                        text = new StringBuilder();
                    }
                }
            }

            // remove unused textview if uneven
            // if column is odd
            if (columnNo % 2 != 0) {
                currentTextLinearLayout.removeViewAt(1);
            }

            // notes usually do not have their own view except if they are the last
            if(stanzas.get(stanzas.size()-1).getNo().contains("note")) {
                buildLyricViewAndAttach(text,hymn.getHymnGroup(),true,false);
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

    private void buildLyricViewAndAttach(final StringBuilder text, HymnGroup selectedHymnGroup, boolean isTrailingNote, boolean isLink) {
        Log.i(this.getClass().getSimpleName(), text.toString());

        TextView view;
        // if column is odd
        if (++columnNo % 2 != 0 || isTrailingNote) {
            currentTextLinearLayout = (LinearLayout) LayoutInflater.from(context).inflate(R.layout.stanza_linear_layout, null);
            stanzaView.addView(currentTextLinearLayout);
            // left column on landscape mode
            view = (TextView) currentTextLinearLayout.getChildAt(0);
        } else {
            // right column on landscape mode
            view = (TextView) currentTextLinearLayout.getChildAt(1);
        }

        if(isLink) {
            SpannableString spannableString = new SpannableString(text);
            ClickableSpan clickableSpan = new ClickableSpan() {
                @Override
                public void onClick(@NonNull View widget) {
                    // Handle the click event, for example, open a browser
                    openWebPage(text.toString().trim());
                }
            };
            // Set the ClickableSpan on the specific portion of the text
            spannableString.setSpan(clickableSpan, 0, text.length(),
                    Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            view.setText(spannableString);
            view.setMovementMethod(LinkMovementMethod.getInstance());
        } else {
            // add colors to text
            CharSequence formattedLyrics = HymnTextFormatter.format(Html.fromHtml(text.toString()), theme.getTextColor(selectedHymnGroup));
            view.setText(formattedLyrics);
        }

        view.setGravity(hymn.getHymnGroup().getTextAlignment());

        // stylize...
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize);
        view.setTextColor(theme.getTextColor());
        view.setBackgroundColor(theme.getTextBackgroundColor());

        // trailing notes have a row exclusively to themselves
        if(isTrailingNote)
            currentTextLinearLayout.removeViewAt(1);
    }

    private void openWebPage(String text) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(text));
        context.startActivity(intent);
    }

    private boolean isNotEmpty(String string) {
        return string!=null && !string.isEmpty();
    }
}
