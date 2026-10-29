package com.lemuelinchrist.hymns

/**
 * Provisions the Kikuyu hymns (KI) from Kikuyu.txt, in the same format as Swahili.txt (see ProvisionSwahili).
 *
 * Source: Brother Kimathi's "Updated and corrected Kikuyu hymnal.pdf" (kept outside git in resources/originals), one
 * typed hymn per page with no hymn numbers, so the hymns are numbered in page order (KI1-KI64). Pages that repeat a
 * hymn are kept as their own numbers for now. Parent: comes from the page's "HYMN NO" (the English hymn), or from the
 * matching Kiswahili hymn where the page has none.
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
