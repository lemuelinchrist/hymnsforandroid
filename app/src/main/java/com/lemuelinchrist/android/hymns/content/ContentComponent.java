package com.lemuelinchrist.android.hymns.content;

import android.content.Context;
import android.view.View;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.entities.Hymn;
import com.lemuelinchrist.android.hymns.logbook.LogBook;

import static com.lemuelinchrist.android.hymns.content.ContentArea.HISTORY_LOGBOOK_FILE;

/**
 * @author Lemuel Cantos
 * @since 22/2/2020
 */
public abstract class ContentComponent<V extends View> {
    protected final Hymn hymn;
    protected final Fragment parentFragment;
    protected final V view;
    protected final Context context;
    private final LogBook historyLogBook;

    public ContentComponent(final Hymn hymn, final Fragment parentFragment, V view) {
        this.hymn = hymn;
        this.parentFragment = parentFragment;
        this.view = view;
        this.context = parentFragment.getContext();
        this.historyLogBook = new LogBook(context,HISTORY_LOGBOOK_FILE);
    }

    protected void logToHistory() {
        historyLogBook.log(hymn);
    }
}
