package com.lemuelinchrist.hymns.lib;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

/**
 * Created by lemuelcantos on 9/8/13.
 */
public class FileUtils {
    public static final String DATA_DIR = Constants.DATA_DIR;

    //To search for webpage add hymn# to url
    // to download midi, add hymn# + '/f=mid'
    // mp3 = /f=mp3

    //https://www.hymnal.net/Hymns/NewTunes/svg/e0496_new_p.svg
    // https://www.hymnal.net/Hymns/NewTunes/svg/e0496_new_g.svg

    public static List<String> listFilesForFolder(final String folderName) {
        File folder = new File(folderName);
        List<String> files = new ArrayList<String>();
        for (final File fileEntry : folder.listFiles()) {
            if (fileEntry.isDirectory()) {
                listFilesForFolder(fileEntry.getAbsolutePath());
            } else {
                files.add(fileEntry.getName());
            }
        }
        return files;
    }

    public static void saveUrl(String filename, String urlString) throws MalformedURLException, IOException
    {
        System.out.println("getting file from "+urlString+"\nand saving it as "+filename);

        BufferedInputStream in = null;
        FileOutputStream fout = null;
        try
        {

            in = new BufferedInputStream(new URL(urlString).openStream());
            fout = new FileOutputStream(filename);

            byte data[] = new byte[1024];
            int count;
            while ((count = in.read(data, 0, 1024)) != -1)
            {
                fout.write(data, 0, count);
            }
            System.out.println("finished saving URL");
        }
        finally
        {
            if (in != null)
                in.close();
            if (fout != null)
                fout.close();
        }
    }
    public static void renameFile(String originalName,String newName) {
        // File (or directory) with old name
        File file = new File(originalName);

        // File (or directory) with new name
        File file2 = new File(newName);
        if(file2.exists()) {
            System.out.println("Warning! File already exists.");
            return;

        }

        // Rename file (or directory)
        boolean success = file.renameTo(file2);
        if (!success) {
            // File was not successfully renamed
        }
    }

    public static void copyFile(String source,String destination) throws IOException {
        InputStream inStream = null;
        OutputStream outStream = null;


            File afile =new File(source);
            File bfile =new File(destination);

            inStream = new FileInputStream(afile);
            outStream = new FileOutputStream(bfile);

            byte[] buffer = new byte[1024];

            int length;
            //copy the file content in bytes
            while ((length = inStream.read(buffer)) > 0){

                outStream.write(buffer, 0, length);

            }

            inStream.close();
            outStream.close();

            System.out.println("File is copied successful!");

    }


    public static boolean doesFileExist(String file) {
        File f = new File(file);
        return f.exists();
    }
}
