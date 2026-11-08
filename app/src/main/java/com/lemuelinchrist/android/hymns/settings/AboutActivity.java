package com.lemuelinchrist.android.hymns.settings;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.lemuelinchrist.android.hymns.R;

/** The About page of Settings: the app's name and version, an email to the developer, and the source code. */
public class AboutActivity extends AppCompatActivity {
    private static final String FEEDBACK_EMAIL = "hymnsforandroid.support@gmail.com";
    private static final String SOURCE_URL = "https://github.com/lemuelinchrist/hymnsforandroid";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.about_activity);

        setSupportActionBar(findViewById(R.id.toolbar));
        ActionBar actionBar = getSupportActionBar();
        if (actionBar != null) {
            actionBar.setDisplayHomeAsUpEnabled(true);
            actionBar.setTitle(R.string.settings_about);
        }
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.settings_layout), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            findViewById(R.id.appbar).setPadding(0, systemBars.top, 0, 0);
            v.setPadding(systemBars.left, 0, systemBars.right, systemBars.bottom);
            return insets;
        });

        final String version = version();
        ((TextView) findViewById(R.id.aboutVersion)).setText(getString(R.string.about_version, version));
        findViewById(R.id.aboutFeedback).setOnClickListener(v -> {
            Intent mail = new Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:" + FEEDBACK_EMAIL));
            mail.putExtra(Intent.EXTRA_SUBJECT, "Hymns For Android " + version);
            open(mail, getString(R.string.about_no_email, FEEDBACK_EMAIL));
        });
        findViewById(R.id.aboutSource).setOnClickListener(v ->
                open(new Intent(Intent.ACTION_VIEW, Uri.parse(SOURCE_URL)), getString(R.string.about_no_browser, SOURCE_URL)));
    }

    private String version() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "";
        }
    }

    private void open(Intent intent, String missing) {
        try {
            startActivity(intent);
        } catch (android.content.ActivityNotFoundException e) {
            Toast.makeText(this, missing, Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public boolean onSupportNavigateUp() {
        finish();
        return true;
    }
}
