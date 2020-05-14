package com.lemuelinchrist.hymns

import com.lemuelinchrist.hymns.lib.Dao
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity
import com.lemuelinchrist.hymns.lib.beans.TuneEntity

import java.util.regex.Matcher
import java.util.regex.Pattern

/**
 *
 * @author Lemuel Cantos
 * @since 2020*
 */
class YoutubePiano {

    private Dao dao = new Dao()


    static void main(String[] args) {
        def youtubePiano = new YoutubePiano();
        youtubePiano.provision();
        println "end!!!!!"
    }

    void provision() {
        def pianoHymns = new File(this.getClass().getResource("/pianoHymns.txt").getPath());
        def iterator = pianoHymns.iterator();
        String line;
        def processedHymns = []

        while (iterator.hasNext()) {
            line = iterator.next().trim()
            Pattern pattern = Pattern.compile('.*?href="(.*?)" target.*?noopener">(.*?)</a></span>(.*?)</span>');
            Matcher matcher = pattern.matcher(line);
            if (matcher.find())
            {
                def title = matcher.group(3).trim()
                def number = matcher.group(2).trim()
                def link = matcher.group(1).trim()

                println "**************************************"
                println "hymn =" + number
                println "title = " + title
                println "href = " + link

                if(!number.isNumber()) {
                    throw new Exception("hymn number invalid")
                }

                HymnsEntity hymn = dao.find("E"+number)
                if(hymn==null) {
                    throw new Exception("hymn not found")
                }
                if(processedHymns.contains(hymn.id)) {
                    println "skipping duplicate!"
                    continue
                }
                TuneEntity tune = new TuneEntity();
                tune.id=hymn.getTune()
                tune.youtubeLink=link
                println tune
                processedHymns+=hymn.id
                try {
                    dao.save(tune)
                } catch (Exception e) {
                    // do nothing
                }

            }
        }

    }
}
