package com.lemuelinchrist.android.hymns.content;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.view.View;
import android.widget.ImageButton;
import android.widget.Toast;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.entities.Stanza;

/**
 * @author Lemuel Cantos
 * @since 22/2/2020
 */
public class CopyButton {
    private final Hymn hymn;
    private final Fragment parentFragment;
    private final ImageButton imageButton;

    public CopyButton(final Hymn hymn, final Fragment parentFragment, ImageButton imageButton) {
        this.hymn = hymn;
        this.parentFragment = parentFragment;
        this.imageButton = imageButton;

        imageButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                StringBuilder lyric = new StringBuilder();
                lyric.append(hymn.getHymnId() + "\n\n");
                for(Stanza stanza:hymn.getStanzas()) {
                    lyric.append(stanza.getNo() +"\n");
                    lyric.append(stanza.getText().replace("<br/>","\n"));
                    lyric.append("\n");
                }
                Context context = parentFragment.getContext();
                ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData clip = ClipData.newPlainText("Hymn lyrics", lyric.toString());
                assert clipboard != null;
                clipboard.setPrimaryClip(clip);
                Toast.makeText(context, "Hymn text copied to Clipboard!", Toast.LENGTH_SHORT).show();
            }
        });
    }
}
