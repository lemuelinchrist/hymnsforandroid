package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.StanzaEntity

/**
 * Created by lcantos on 03/2022.
 */
class ProvisionSpanishTitles {
    static File spanishFile;

    public static void main(String[] args) throws Exception {
        Dao dao = new Dao();
        spanishFile = new File(this.getClass().getResource("/spanishTitles.txt").getPath());

        Iterator<String> iterator = spanishFile.iterator();
        Integer hymnNumber = 1;
        HymnsEntity hymn;

        while (iterator.hasNext()) {
            hymn = dao.find('S' + hymnNumber++)
            String line = iterator.next();
            if(!line.contains("- ")) {
                throw new RuntimeException("No Dash!: " + hymnNumber)
            }
            String[] splitLines = line.split("- ")

            String main = splitLines[0].trim()

            String sub="";
            if(splitLines.size()==2) {
               sub = splitLines[1].trim()
            }

            println("main: **"+ main +"***")
            println("sub: **"+ sub +"***")

            hymn.setMainCategory(main);
            if(main.equals("CANTICOS BIBLICOS")) {
                hymn.setVerse(sub)
            } else if(!sub.isEmpty() && !sub.equals("*")) {
                hymn.setSubCategory(sub);
            }
            println(hymn)
            dao.save(hymn)
        }

    }

}
