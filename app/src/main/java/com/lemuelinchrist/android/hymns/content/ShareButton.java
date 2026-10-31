package com.lemuelinchrist.android.hymns.content;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.view.ContextThemeWrapper;
import android.widget.ImageButton;
import android.widget.PopupMenu;
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
            PopupMenu menu = new PopupMenu(new ContextThemeWrapper(context, R.style.ShareMenu), v);
            menu.getMenu().add("Share lyrics").setOnMenuItemClickListener(item -> {
                share(lyricsText(hymn));
                return true;
            });
            menu.getMenu().add("Share link").setOnMenuItemClickListener(item -> {
                share(title(hymn) + "\n" + WEB_APP_HYMN + hymn.getHymnId());
                return true;
            });
            menu.getMenu().add("Copy lyrics").setOnMenuItemClickListener(item -> {
                copy(lyricsText(hymn));
                return true;
            });
            menu.show();
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
        Toast.makeText(context, "Lyrics copied", Toast.LENGTH_SHORT).show();
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
     * stanza under its number, a chorus under its note in brackets if it has one, notes as they are, without the
     * YouTube/SoundCloud stanzas.
     */
    static String lyricsText(Hymn hymn) {
        StringBuilder out = new StringBuilder(title(hymn)).append("\n\n");
        for (Stanza stanza : hymn.getStanzas()) {
            String no = stanza.getNo() == null ? "" : stanza.getNo().toLowerCase();
            if (no.contains("youtube") || no.contains("soundcloud")) continue;
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
