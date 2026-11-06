package com.lemuelinchrist.android.hymns.settings;

import android.content.Context;
import android.content.res.TypedArray;
import android.util.AttributeSet;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.widget.SwitchCompat;
import com.lemuelinchrist.android.hymns.R;

/**
 * One row of the Settings screen: a tinted icon, a title, a summary, and on the right a chevron (the row opens
 * something) or a switch (the whole row toggles it). Set in XML with rowIcon, rowTitle, rowSummary and rowTrailing.
 */
public class SettingsRow extends LinearLayout {
    private static final int TRAILING_CHEVRON = 1, TRAILING_SWITCH = 2;

    private final TextView title, summary;
    private final SwitchCompat toggle;
    private OnCheckedChangeListener listener;

    public interface OnCheckedChangeListener {
        void onCheckedChanged(SettingsRow row, boolean checked);
    }

    public SettingsRow(Context context, AttributeSet attrs) {
        super(context, attrs);
        setOrientation(HORIZONTAL);
        setGravity(android.view.Gravity.CENTER_VERTICAL);
        int pad = (int) (16 * getResources().getDisplayMetrics().density);
        setPadding(pad, pad - 2, pad, pad - 2);
        setMinimumHeight((int) (72 * getResources().getDisplayMetrics().density));
        LayoutInflater.from(context).inflate(R.layout.settings_row, this);
        title = findViewById(R.id.rowTitle);
        summary = findViewById(R.id.rowSummary);
        toggle = findViewById(R.id.rowSwitch);

        TypedArray a = context.obtainStyledAttributes(attrs, R.styleable.SettingsRow);
        try {
            ((ImageView) findViewById(R.id.rowIcon)).setImageResource(a.getResourceId(R.styleable.SettingsRow_rowIcon, 0));
            title.setText(a.getString(R.styleable.SettingsRow_rowTitle));
            setSummary(a.getString(R.styleable.SettingsRow_rowSummary));
            int trailing = a.getInt(R.styleable.SettingsRow_rowTrailing, 0);
            findViewById(R.id.rowChevron).setVisibility(trailing == TRAILING_CHEVRON ? VISIBLE : GONE);
            toggle.setVisibility(trailing == TRAILING_SWITCH ? VISIBLE : GONE);
            if (trailing == TRAILING_SWITCH) {
                setOnClickListener(v -> setCheckedByUser(!toggle.isChecked()));
            }
        } finally {
            a.recycle();
        }
        setClickable(true);
        setFocusable(true);
        android.util.TypedValue ripple = new android.util.TypedValue();
        if (context.getTheme().resolveAttribute(android.R.attr.selectableItemBackground, ripple, true)) {
            setForeground(androidx.core.content.ContextCompat.getDrawable(context, ripple.resourceId));
        }
    }

    public void setSummary(CharSequence text) {
        summary.setText(text);
        summary.setVisibility(text == null || text.length() == 0 ? GONE : VISIBLE);
    }

    /** Sets the switch without calling the listener. */
    public void setChecked(boolean checked) {
        toggle.setChecked(checked);
    }

    public void setOnCheckedChangeListener(OnCheckedChangeListener listener) {
        this.listener = listener;
    }

    /** Puts a view (the book chips) between the text and the chevron. */
    public void addBeforeTrailing(View view) {
        addView(view, indexOfChild(findViewById(R.id.rowChevron)));
    }

    private void setCheckedByUser(boolean checked) {
        toggle.setChecked(checked);
        if (listener != null) listener.onCheckedChanged(this, checked);
    }

    @Override
    public CharSequence getAccessibilityClassName() {
        return toggle.getVisibility() == View.VISIBLE ? SwitchCompat.class.getName() : super.getAccessibilityClassName();
    }
}
