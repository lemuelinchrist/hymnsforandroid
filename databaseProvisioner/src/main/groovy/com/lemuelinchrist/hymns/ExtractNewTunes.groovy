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

//         **************************midis
        for (int x=450;x<=454;x++){
            HymnsEntity hymn = dao.find("BF"+x)
            HymnalNetExtractor.downloadMidi(Constants.NEW_TUNES_SHEET_LINK, hymn, hymn.getParentHymn().replace("E","")+"b")
        }
        for (int x=440;x<=449;x++){
            HymnsEntity hymn = dao.find("BF"+x)
            HymnalNetExtractor.downloadMidi(Constants.NEW_TUNES_SHEET_LINK, hymn, hymn.getParentHymn().replace("E",""))
        }


        int[] csHymns = [10,1001,1002,1003,1004,1005,103,104,105,106,107,11,111,112,113,114,115,117,118,119,12,121,123,124,126,127,128,129,13,130,134,135,136,137,14,146,147,149,15,150,17,203,204,205,206,207,208,21,211,213,219,222,223,224,226,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,244,246,257,26,27,303,304,306,308,309,311,312,313,314,315,316,317,318,319,320,321,322,323,324,325,326,327,329,334,342,346,347,348,349,35,4,402,403,404,407,409,410,411,412,413,415,416,417,418,419,420,421,422,423,425,426,427,428,429,454,456,457,458,459,460,461,462,463,464,465,466,467,468,502,509,510,517,518,519,520,521,522,524,526,527,528,531,532,533,542,543,601,602,604,605,607,608,609,610,612,613,614,615,618,702,703,704,705,706,707,708,710,713,714,715,717,718,719,722,723,724,725,726,727,728,729,730,731,732,733,734,735,736,737,738,739,740,741,742,743,744,745,746,747,748,749,750,751,752,761,762,801,802,803,804,805,807,808,809,811,813,814,816,817,819,820,821,822,823,824,826,827,828,829,830,831,832,833,835,836,837,838,839,840,841,842,843,844,845,846,847,848,849,860,861,862,863,864,865,866,867,870,871,872,873,874,875,878,879,880,902,903,904,906,907,908,910,911,913,926,927,928]
        for (int x:csHymns){
            HymnsEntity hymn = dao.find("CS"+x)
            HymnalNetExtractor.downloadTune(Constants.HYMNAL_NET_CHINESE_SUPPLEMENT, hymn,hymn.getNo())
        }

        int[] cHymns = [15,17,28,39,43,47,67,71,86,89,90,103,107,111,127,128,132,136,137,174,182,183,188,189,191,192,195,198,199,205,206,212,239,243,244,245,253,255,261,273,276,283,292,293,303,305,310,313,315,316,319,323,326,327,329,347,352,353,357,360,380,385,392,393,409,413,421,424,430,432,438,439,442,444,450,463,468,474,482,487,488,490,505,511,512,518,519,548,549,570,577,578,617,619,620,623,625,635,649,651,652,660,661,678,689,690,691,697,702,710,712,713,714,715,716,734,736,744,752,753,757,761,762,770,1002,1006]
        for (int x:cHymns){
            HymnsEntity hymn = dao.find("C"+x)
            HymnalNetExtractor.downloadTune(Constants.HYMNAL_NET_CHINESE, hymn,hymn.getNo())
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