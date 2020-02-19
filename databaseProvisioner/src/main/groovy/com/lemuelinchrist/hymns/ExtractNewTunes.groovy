package com.lemuelinchrist.hymns;

import com.lemuelinchrist.hymns.lib.Constants;
import com.lemuelinchrist.hymns.lib.Dao;
import com.lemuelinchrist.hymns.lib.HymnalNetExtractor;
import com.lemuelinchrist.hymns.lib.beans.HymnsEntity;
import org.codehaus.groovy.runtime.DefaultGroovyMethods;

/**
 * Created by lemuelcantos on 6/7/16.
 */
class ExtractNewTunes {
    static void main(String[] arg) throws Exception {
        Dao dao = new Dao();

        int[] newHymnNo = [251,321,339,369,449,496,523,525,731,806]
        int bfNo =440;
        for (int x: newHymnNo){
            HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.NEW_TUNES_SHEET_LINK, "" + x, "BF", "" + bfNo++)
            dao.save(hymn);
        }

        newHymnNo = [ 284,350,394,711,720]
        bfNo =450;
        for (int x: newHymnNo){
            HymnsEntity hymn = HymnalNetExtractor.convertWebPageToHymn(Constants.NEW_TUNES_SHEET_LINK, "" + x + "b", "BF", "" + bfNo++)
            dao.save(hymn);
        }
    }
}

/** list of all New Tunes:
 12
 33
 96
 154
 165
 172
 204
 208
 223
 251
 252
 284
 285
 287
 293
 321
 323
 325
 339
 343
 350
 352
 356
 367
 369
 374
 377
 378
 383
 389
 394
 407
 412
 426
 431
 432
 434
 437
 439
 449
 474
 477
 496
 498
 512
 513
 521
 523
 525
 531
 543
 547
 553
 575
 578
 599
 600
 605
 641
 642
 643
 647
 673
 708
 711
 716
 720
 721
 723
 724
 731
 788
 789
 806
 857
 995
 1008
 1040
 1048
 1049
 1050
 1057
 1079
 1158
 1174
 1210
 1222
 1238
 1271
 1278
 1307
 1325
 284b
 350b
 394b
 711b
 720b
**/