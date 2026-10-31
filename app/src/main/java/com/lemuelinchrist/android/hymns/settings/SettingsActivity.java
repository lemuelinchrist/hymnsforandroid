package com.lemuelinchrist.android.hymns.settings;

import android.app.AlertDialog;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.fragment.app.DialogFragment;
import androidx.fragment.app.FragmentActivity;
import androidx.preference.Preference;
import androidx.preference.PreferenceFragmentCompat;
import com.lemuelinchrist.android.hymns.R;
import com.lemuelinchrist.android.hymns.logbook.ChordEditsBackup;
import com.lemuelinchrist.android.hymns.logbook.FavoritesBackup;
import com.lemuelinchrist.android.hymns.style.Theme;

public class SettingsActivity extends AppCompatActivity {

    private FavoritesBackup favoritesBackup;
    private ChordEditsBackup chordEditsBackup;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.settings_activity);
        favoritesBackup = new FavoritesBackup(this, added -> {});
        chordEditsBackup = new ChordEditsBackup(this, this::updateChordEditsSummary);

        Toolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);
        ActionBar actionBar = getSupportActionBar();
        if (actionBar != null) {
            actionBar.setDisplayHomeAsUpEnabled(true);
            actionBar.setTitle("Settings");
        }

        // Apply window insets to handle edge-to-edge display on Android 15+
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.settings_layout), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());

            // Top padding for the AppBar so it stays below status bar icons
            findViewById(R.id.appbar).setPadding(0, systemBars.top, 0, 0);

            // Bottom padding for the root layout so content stays above nav bar
            v.setPadding(systemBars.left, 0, systemBars.right, systemBars.bottom);

            return insets;
        });

        getSupportFragmentManager()
                .beginTransaction()
                .replace(R.id.settings, new SettingsFragment())
                .commit();
    }

    private void updateChordEditsSummary() {
        SettingsFragment fragment = (SettingsFragment) getSupportFragmentManager().findFragmentById(R.id.settings);
        Preference preference = fragment == null ? null : fragment.findPreference("chordEdits");
        if (preference != null) preference.setSummary(chordEditsBackup.summary());
    }

    public static class SettingsFragment extends PreferenceFragmentCompat {
        @Override
        public void onCreatePreferences(Bundle savedInstanceState, String rootKey) {
            setPreferencesFromResource(R.xml.root_preferences, rootKey);
            Preference aboutPreference = findPreference("about");
            aboutPreference.setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
                @Override
                public boolean onPreferenceClick(Preference preference) {
                    DialogFragment aboutFragment = new AboutDialog();
                    aboutFragment.show(getParentFragmentManager(), "About");
                    return true;
                }
            });
            Preference favePreference = findPreference("manageFaves");
            favePreference.setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
                @Override
                public boolean onPreferenceClick(Preference preference) {
                    ((SettingsActivity) requireActivity()).favoritesBackup.showMenu();
                    return true;
                }
            });
            // a new choice changes the night mode at once; the open screens are made again in it
            findPreference(Theme.PREFERENCE).setOnPreferenceChangeListener((preference, choice) -> {
                Theme.apply(requireContext(), (String) choice);
                return true;
            });
            findPreference("chordEdits").setOnPreferenceClickListener(preference -> {
                ((SettingsActivity) requireActivity()).chordEditsBackup.showMenu();
                return true;
            });
        }

        // the count changes when a sheet opened from the list is edited, or after an import
        @Override
        public void onResume() {
            super.onResume();
            ((SettingsActivity) requireActivity()).updateChordEditsSummary();
        }
    }

    public static class AboutDialog extends DialogFragment {
        @Override
        public android.app.Dialog onCreateDialog(Bundle savedInstanceState) {
            FragmentActivity activity = getActivity();
            AlertDialog.Builder builder = new AlertDialog.Builder(activity);
            // Dynamically set the version number
            try {
                String version = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
                LayoutInflater inflater = requireActivity().getLayoutInflater();
                View inflate = inflater.inflate(R.layout.about, null);
                TextView hymnVersion = inflate.findViewById(R.id.hymnVersiontextView);
                hymnVersion.setText(version);
                builder.setView(inflate);
            } catch (PackageManager.NameNotFoundException e) {
                e.printStackTrace();
            }
            return builder.create();
        }
    }
}
