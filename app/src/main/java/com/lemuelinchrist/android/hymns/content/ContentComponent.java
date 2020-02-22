package com.lemuelinchrist.android.hymns.content;

import android.content.Context;
import android.view.View;
import androidx.fragment.app.Fragment;
import com.lemuelinchrist.android.hymns.entities.Hymn;

/**
 * @author Lemuel Cantos
 * @since 22/2/2020
 */
public abstract class ContentComponent<V extends View> {
    protected final Hymn hymn;
    protected final Fragment parentFragment;
    protected final V view;
    protected final Context context;

    public ContentComponent(final Hymn hymn, final Fragment parentFragment, V view) {
        this.hymn = hymn;
        this.parentFragment = parentFragment;
        this.view = view;
        this.context = parentFragment.getContext();
    }
}
