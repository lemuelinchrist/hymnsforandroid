package com.lemuelinchrist.android.hymns.logbook;

import android.content.Context;

import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;

/**
 * Created by lemuelcantos on 7/12/14.
 */
public final class InternalStorage{

    private InternalStorage() {}

    public static void writeObject(Context context, String key, Object object) throws IOException {
        try (FileOutputStream fos = context.openFileOutput(key, Context.MODE_PRIVATE);
             ObjectOutputStream oos = new ObjectOutputStream(fos)) {
            oos.writeObject(object);
        }
    }

    public static Object readObject(Context context, String key) throws IOException,
            ClassNotFoundException {
        try (FileInputStream fis = context.openFileInput(key);
             ObjectInputStream ois = new ObjectInputStream(fis)) {
            return ois.readObject();
        }
    }
}