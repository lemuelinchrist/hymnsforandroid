package com.lemuelinchrist.android.hymns.settings;

import android.app.AlertDialog;
import android.app.Dialog;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.TextView;
import androidx.appcompat.app.ActionBar;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.DialogFragment;
import androidx.fragment.app.FragmentActivity;
import androidx.preference.Preference;
import androidx.preference.PreferenceFragmentCompat;
import com.lemuelinchrist.android.hymns.R;

public class SettingsActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.settings_activity);
        getSupportFragmentManager()
                .beginTransaction()
                .replace(R.id.settings, new SettingsFragment())
                .commit();
        ActionBar actionBar = getSupportActionBar();
        if (actionBar != null) {
            actionBar.setDisplayHomeAsUpEnabled(true);
        }
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
                    aboutFragment.show(getFragmentManager(),"About");
                    return true;
                }
            });
            Preference favePreference = findPreference("manageFaves");
            favePreference.setOnPreferenceClickListener(new Preference.OnPreferenceClickListener() {
                @Override
                public boolean onPreferenceClick(Preference preference) {
                    DialogFragment favoriteSettingsDialog = new FavoriteSettingsDialog();
                    favoriteSettingsDialog.show(getFragmentManager(),"manageFaves");
                    return true;
                }
            });
        }

        public static class AboutDialog extends DialogFragment {
            @Override
            public Dialog onCreateDialog(Bundle savedInstanceState) {
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
}