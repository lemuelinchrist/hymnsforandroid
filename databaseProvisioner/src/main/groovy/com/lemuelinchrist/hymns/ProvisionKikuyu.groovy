package com.lemuelinchrist.hymns

/**
 * Provisions the Kikuyu hymns (KI) from Kikuyu.txt, in the same format as Swahili.txt (see ProvisionSwahili).
 *
 * Source: Brother Kimathi's "Kikuyu hymnal .pdf" (2026-10-30, kept outside git in resources/originals), screenshots
 * of his original typed pages with no hymn numbers, so the hymns are numbered in the order of the file (KI1-KI70).
 * Lines cut off in the screenshots, and KI71-KI72, come from his earlier "Updated and corrected Kikuyu hymnal.pdf".
 * Holy names are capitalized as he asked: Roho, Muoyo and the possessives (Waku, Wake, ...) only where they mean God. Parent: comes from
 * the page's "HYMN NO" (the English hymn), or from the matching Kiswahili hymn where the page has none.
 *
 * @since 2026-10-29
 */
class ProvisionKikuyu extends ProvisionSwahili {

    ProvisionKikuyu() {
        group = 'KI'
        resource = '/Kikuyu.txt'
        maxNo = 300
    }

    public static void main(String[] args) {
        def kikuyu = new ProvisionKikuyu();
        kikuyu.removeSwahiliHymns()
        kikuyu.provision();

        println "Kikuyu import finished!!!!!"
    }
}
