package com.lemuelinchrist.android.hymns.content;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.PopupWindow;
import android.widget.Toast;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.entities.Stanza;

/**
 * Shares the hymn: its lyrics or a link to it in the web app (which opens on any phone), or copies the lyrics. A menu
 * rather than one action, because saints who paste lyrics into slides or notes don't want a link in them, and a small
 * group about to sing together is better served by the link. Copy stays in the menu since Android 7-9's share sheet
 * has no Copy entry.
 *
 * @author Lemuel Cantos
 * @since 22/2/2020
 */
public class ShareButton extends ContentComponent<ImageButton> {
    // the web app's address for one hymn (tools/web/src/app.js, "#/h/E8")
    static final String WEB_APP_HYMN = "https://lemuelinchrist.github.io/hymnsforandroid/#/h/";

    public ShareButton(final Hymn hymn, final Fragment parentFragment, ImageButton imageButton) {
        super(hymn, parentFragment, imageButton);

        imageButton.setOnClickListener(v -> {
            logToHistory();
            View card = LayoutInflater.from(context).inflate(R.layout.popup_share, null);
            PopupWindow popup = new PopupWindow(card, ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT, true);
            popup.setElevation(12 * context.getResources().getDisplayMetrics().density);
            card.findViewById(R.id.shareLyrics).setOnClickListener(row -> {
                popup.dismiss();
                share(lyricsText(hymn));
            });
            card.findViewById(R.id.shareLink).setOnClickListener(row -> {
                popup.dismiss();
                share(title(hymn) + "\n" + WEB_APP_HYMN + hymn.getHymnId());
            });
            card.findViewById(R.id.copyLyrics).setOnClickListener(row -> {
                popup.dismiss();
                copy(lyricsText(hymn));
            });
            // under the button, kept inside the screen with a margin
            float density = context.getResources().getDisplayMetrics().density;
            card.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED);
            int[] at = new int[2];
            v.getLocationOnScreen(at);
            int screenWidth = context.getResources().getDisplayMetrics().widthPixels;
            int margin = (int) (12 * density);
            int x = Math.max(margin, Math.min(at[0] + v.getWidth() / 2 - card.getMeasuredWidth() / 2,
                    screenWidth - card.getMeasuredWidth() - margin));
            popup.showAtLocation(v, Gravity.TOP | Gravity.START, x, at[1] + v.getHeight());
        });
    }

    private void share(String text) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_SUBJECT, title(hymn));
        send.putExtra(Intent.EXTRA_TEXT, text);
        context.startActivity(Intent.createChooser(send, null));
    }

    private void copy(String text) {
        ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) return;
        clipboard.setPrimaryClip(ClipData.newPlainText("Hymn lyrics", text));
        Toast.makeText(context, R.string.lyrics_copied, Toast.LENGTH_SHORT).show();
    }

    /** "E123 · first line" */
    static String title(Hymn hymn) {
        String first = hymn.getFirstStanzaLine() == null ? "" : plain(hymn.getFirstStanzaLine());
        if (first.isEmpty() && hymn.getStanzas() != null && !hymn.getStanzas().isEmpty())
            first = plain(hymn.getStanzas().get(0).getText()).split("\n")[0];
        return hymn.getHymnId() + (first.isEmpty() ? "" : " · " + first);
    }

    /**
     * The lyrics as plain text, as the web app copies them (lyricsText in tools/web/src/app.js): the title, then each
     * stanza under its number, a chorus under its note in brackets if it has one, notes as they are.
     */
    static String lyricsText(Hymn hymn) {
        StringBuilder out = new StringBuilder(title(hymn)).append("\n\n");
        for (Stanza stanza : hymn.getStanzas()) {
            String no = stanza.getNo() == null ? "" : stanza.getNo().toLowerCase();
            String text = plain(stanza.getText());
            if (text.isEmpty()) continue;
            if (no.equals("chorus")) {
                if (stanza.getNote() != null && !stanza.getNote().trim().isEmpty())
                    out.append("(").append(plain(stanza.getNote())).append(")\n");
            } else if (!no.contains("note") && !no.equals("copyright")) {
                out.append(stanza.getNo()).append("\n");
            }
            out.append(text).append("\n\n");
        }
        return out.toString().trim() + "\n";
    }

    /** Stanza markup to plain text with \n line breaks (plain in tools/web/src/db.js). */
    static String plain(String html) {
        if (html == null) return "";
        return html.replaceAll("(?s)<!--.*?-->", "").replaceAll("(?i)<br\\s*/?>", "\n").replaceAll("<[^>]*>", "")
                .replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").trim();
    }
}
