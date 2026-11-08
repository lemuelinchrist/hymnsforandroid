package com.lemuelinchrist.android.hymns;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentManager;
import androidx.fragment.app.FragmentStatePagerAdapter;
import androidx.viewpager.widget.ViewPager;
import com.lemuelinchrist.android.hymns.content.ContentArea;
import com.lemuelinchrist.android.hymns.content.OnLyricVisibleListener;
import com.lemuelinchrist.android.hymns.content.PlayButton;
import com.lemuelinchrist.android.hymns.dao.HymnsDao;
import com.lemuelinchrist.android.hymns.logbook.HymnRecord;
import com.lemuelinchrist.android.hymns.logbook.LogBook;
import com.lemuelinchrist.android.hymns.utils.HymnStack;

import java.util.ArrayList;
import java.util.HashMap;

import static com.lemuelinchrist.android.hymns.content.ContentArea.HISTORY_LOGBOOK_FILE;

/**
 * Created by lemuel on 26/4/2017.
 */
public class HymnBookCollection implements OnLyricVisibleListener {

    private HashMap<HymnGroup, HymnBookGroup> hymnBooks = new HashMap<>();
    private final ViewPager lyricPager;
    private HymnsDao dao;
    private HashMap<Integer, ContentArea> registeredFragments = new HashMap<>();

    private final HymnsActivity context;
    private HymnBookGroup currentHymnBookGroup;
    private HymnStack hymnStack = new HymnStack(HymnGroup.DEFAULT_HYMN_NUMBER);
    private boolean hymnStackSeeded = false;
    // the hymn the back-to-hymn button belongs to (the related hymn we switched to), until another hymn is shown
    private String relatedTo;
    // how far down the hymn left was scrolled, for the related hymn being switched to (not scrolled to its top)
    private Float keepScroll;
    // until when the toolbar stays as it is (hidden by scrolling) for such a switch: the pager and the switch both
    // would bring it back, which pushes the page down
    private long keepToolbarUntil;

    private boolean keepingToolbar() {
        return System.currentTimeMillis() < keepToolbarUntil;
    }

    public HymnBookCollection(final HymnsActivity context, final ViewPager lyricPager) {
        this.context = context;
        dao = new HymnsDao(context);
        this.lyricPager = lyricPager;
        // a swiped-to hymn opens at its top (ContentArea), so the toolbar comes back too: else its header would sit
        // under the status bar when the toolbar was hidden by scrolling the last hymn. Once the pager is at rest, and
        // after it has moved the focus to the new page: on Android 16 and up a page taking focus asks to be shown in
        // full, and the app bar hides itself for that.
        lyricPager.addOnPageChangeListener(new ViewPager.SimpleOnPageChangeListener() {
            private boolean pageChanged;

            @Override
            public void onPageSelected(int position) {
                pageChanged = true;
            }

            @Override
            public void onPageScrollStateChanged(int state) {
                if (state == ViewPager.SCROLL_STATE_IDLE && pageChanged) {
                    pageChanged = false;
                    if (!keepingToolbar()) lyricPager.post(context::showToolbar);
                }
            }
        });

        switchHymnBook(HymnGroup.getHymnGroupFromID(HymnGroup.firstHymn(context)));
    }

    public void refresh() {
        String currentHymnId;
        // If current hymn id is not present, get it from history
        if(getCurrentHymnId()==null) {
            LogBook historyLogBook = new LogBook(context,HISTORY_LOGBOOK_FILE);
            HymnRecord[] records = historyLogBook.getOrderedRecordList();
            currentHymnId = records.length>0 ? records[0].getHymnId() : HymnGroup.firstHymn(context);
        } else {
            currentHymnId =  getCurrentHymnId();
        }
        // the hymn we start on is where Back ends up (not always hymn E1)
        if (!hymnStackSeeded) {
            hymnStack.reset(currentHymnId);
            hymnStackSeeded = true;
        }
        hymnBooks = new HashMap<>();
        try {
            switchHymnBook(HymnGroup.getHymnGroupFromID(currentHymnId));
            switchToHymn(currentHymnId);
        } catch (NoSuchHymnGroupException e) {
          Log.e(this.getClass().getName(),e.getMessage());
        }
    }

    private void switchHymnBook(HymnGroup hymnGroup) {
        switchHymnBook(hymnGroup, null);
    }

    /**
     * Shows the book. With a hymn number the pager is set to that hymn at once: a pager given an adapter starts on its
     * first page, which would show hymn 1 (and put it in History, and in the title) before the move to the hymn.
     */
    private void switchHymnBook(HymnGroup hymnGroup, String hymnNo) {

        if (!hymnBooks.containsKey(hymnGroup)) {
            Log.d(this.getClass().getName(), "generating new instance of HymnBook for selected hymn group: " + hymnGroup);
            HymnBookGroup hymnBookGroup = new HymnBookGroup(context.getSupportFragmentManager());

            dao.open();
            try {
                hymnBookGroup.hymnNumbers = dao.getArrayByHymnNo(hymnGroup);
                hymnBookGroup.hymnGroup = hymnGroup;
            } finally {
                dao.close();
            }

            hymnBooks.put(hymnGroup, hymnBookGroup);
        }
        HymnBookGroup book = hymnBooks.get(hymnGroup);
        int start = hymnNo == null ? -1 : Math.max(0, book.getPositionOfHymnNo(hymnNo));
        book.startAt = start;
        lyricPager.setAdapter(null);
        lyricPager.setAdapter(book);
        this.currentHymnBookGroup = book;
        if (start > 0) lyricPager.setCurrentItem(start, false);
        book.startAt = -1;

    }

    public String getCurrentHymnId() {
        if(getCurrentHymnLyric()==null) {
            return null;
        }
        return getCurrentHymnLyric().getHymnId();
    }

    private ContentArea getCurrentHymnLyric() {
        return currentHymnBookGroup.getLyricContainer(lyricPager.getCurrentItem());
    }

    public void switchToHymnAndRememberChoice(String hymnNo) {
        // remember where we came from first, then the new hymn, so Back returns to where we came from
        String from = getCurrentHymnId();
        if (from != null) hymnStack.push(from);
        hymnStack.push(hymnNo);
        switchToHymn(hymnNo);
    }

    /**
     * A switch to a related hymn (another language of the hymn being read): like switchToHymnAndRememberChoice, and
     * the round button on the lower right offers the way back to the hymn left, until another hymn is shown.
     */
    public void switchToRelatedHymn(String related) {
        switchToRelatedHymn(related, true);
    }

    /**
     * @param sameSpot true for another language of the hymn (the page opens at the same place, and a hidden toolbar
     *                 stays hidden, so the verse being sung stays in view); false for a hymn that is something else
     *                 (a New Tune), which opens at its top like any hymn, with the toolbar showing
     */
    public void switchToRelatedHymn(String related, boolean sameSpot) {
        String from = getCurrentHymnId();
        if (from == null || from.equals(related)) {
            switchToHymnAndRememberChoice(related);
            return;
        }
        relatedTo = related;   // before the switch: the new page reports it is shown while switching
        ContentArea leaving = getCurrentHymnLyric();
        keepScroll = !sameSpot || leaving == null ? null : leaving.getScrollFraction();
        keepToolbarUntil = sameSpot && context.isToolbarHidden() ? System.currentTimeMillis() + 1000 : 0;
        switchToHymnAndRememberChoice(related);
        context.showBackToHymn(from);
    }

    public void switchToHymn(String hymnId) {

        final Float keep = keepScroll;   // for this switch only
        keepScroll = null;
        if (keep == null) keepToolbarUntil = 0;
        if (hymnId.equals(getCurrentHymnId())) return;

        Log.i(getClass().getName(), "switching to hymn " + hymnId);

        HymnGroup selectedHymnGroup = null;
        try {
            selectedHymnGroup = HymnGroup.getHymnGroupFromID(hymnId);
        } catch (NoSuchHymnGroupException e) {
            e.printStackTrace();
            return;
        }
        final String selectedHymnNumber = HymnGroup.getHymnNoFromID(hymnId);

        // in case of a garbage collection cache wipe. note: this is not tested. probably useless.
        if(getCurrentHymnLyric()==null) {
            Log.e(this.getClass().getName(), "current hymn lyric missing! generating new hymn book");
            hymnBooks = new HashMap<>();
            switchHymnBook(selectedHymnGroup, selectedHymnNumber);
        }

        if (currentHymnBookGroup != null && selectedHymnGroup != currentHymnBookGroup.hymnGroup) {
            switchHymnBook(selectedHymnGroup, selectedHymnNumber);

        }

        // the hymn was removed from the database (e.g. an old history or favourites entry):
        // forget it and go to the first hymn of its group
        if (currentHymnBookGroup.getPositionOfHymnNo(selectedHymnNumber) < 0) {
            Log.w(getClass().getName(), "hymn " + hymnId + " not found. going to the first hymn of its group");
            LogBook.removeFromHistoryAndFavorites(context, hymnId);
        }


        new Handler(Looper.getMainLooper()).post(new Runnable() {
            @Override
            public void run() {
                Log.i(getClass().getName(), "Hymn group switch should have been completed by now. \n" +
                        "position of hymn no: " + currentHymnBookGroup.getPositionOfHymnNo(selectedHymnNumber) +
                        "\n attempting to switch to hymn number: " + selectedHymnNumber);
                // straight to the hymn, not scrolling past the hymns between (a link, Back or Search is not a swipe)
                lyricPager.setCurrentItem(Math.max(0, currentHymnBookGroup.getPositionOfHymnNo(selectedHymnNumber)), false);
                // the new hymn opens at its top, with the toolbar showing the hymn number
                lyricPager.post(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            ContentArea shown = getCurrentHymnLyric();
                            if (shown != null) {
                                // a related hymn (another language) opens at the same place, any other at its top
                                if (keep != null) shown.scrollToFraction(keep); else shown.scrollToTop();
                            }
                            if (!keepingToolbar()) context.showToolbar();
                        } catch (Exception e) {
                            Log.e(getClass().getName(), "Error trying to scroll to the top of the hymn");
                        }
                    }
                });
                try {
                    context.onLyricVisible(getCurrentHymnId());
                } catch (Exception e) {
                    Log.e(getClass().getName(), "Error trying to switch Title hymn");

                }
            }
        });


    }

    public void translateTo(HymnGroup selectedHymnGroup) {
        if (selectedHymnGroup == currentHymnBookGroup.hymnGroup) return;
        String related = getCurrentHymnLyric().getRelatedHymnOf(selectedHymnGroup);
        if (related == null) {
            switchToHymn(selectedHymnGroup + "1");
        } else {
            switchToRelatedHymn(related);
        }

    }

    public void logToHistory() {
        getCurrentHymnLyric().log();
    }

    @Override
    public void onLyricVisible(String hymnId) {
        // Sometimes music might be playing in the background. Stop it.
        PlayButton.stopCurrentlyPlayingButton();

        // any hymn but the related one ends the offer to go back (a swipe, Search, Back, a similar tune)
        if (relatedTo != null && !relatedTo.equals(hymnId)) {
            relatedTo = null;
            context.hideBackToHymn();
        }

        // sometimes current hymn lyric is null becuase of a random garbage cleanup.
        if(getCurrentHymnLyric()==null) {
            Log.e(getClass().getName(), "Error trying to get current hymn lyric. is null.");
        } else {
            logToHistory();
        }
    }

    /** Back button: returns false when there is nothing to go back to. */
    public boolean goToPreviousHymn() {
        if (!hymnStack.hasPrevious()) return false;
        String poppedHymn = hymnStack.pop();
        if (poppedHymn != null) switchToHymn(poppedHymn);
        return true;
    }

    private class HymnBookGroup extends FragmentStatePagerAdapter {

        private ArrayList<String> hymnNumbers;
        private HymnGroup hymnGroup;
        ContentArea currentContentArea;
        // while the pager is given this book to open on this page: no other page is made the current one meanwhile
        private int startAt = -1;


        public ArrayList<String> getHymnNumbers() {
            return hymnNumbers;
        }

        public HymnBookGroup(FragmentManager fm) {
            super(fm);
        }

        public int getPositionOfHymnNo(String hymnNo) {
            return hymnNumbers.indexOf(hymnNo);
        }

        @Override
        public Fragment getItem(int position) {
            Log.d(getClass().getSimpleName(), "getItem position: " + position);

            ContentArea lyric = ContentArea.newInstance(context);
            lyric.setHymnStack(hymnStack);
            lyric.addLyricVisibleListener(context);
            lyric.addLyricVisibleListener(HymnBookCollection.this);
            lyric.setHymn(hymnGroup.toString() + hymnNumbers.get(position));
            currentContentArea = lyric;

            return lyric;
        }

        @Override
        public int getCount() {
            return hymnNumbers.size();
        }

        @Override
        public void setPrimaryItem(ViewGroup container, int position, Object object) {
            // the pager starts on page 0 whatever it is told next; that page must not report it is shown
            if (startAt >= 0 && position != startAt) return;
            super.setPrimaryItem(container, position, object);
        }

        @Override
        public Object instantiateItem(ViewGroup container, int position) {
            ContentArea fragment = (ContentArea) super.instantiateItem(container, position);
            registeredFragments.put(position, fragment);
            return fragment;
        }

        @Override
        public void destroyItem(ViewGroup container, int position, Object object) {
            registeredFragments.remove(position);
            super.destroyItem(container, position, object);
        }

        ContentArea getLyricContainer(int position) {
            return registeredFragments.get(position);
        }


    }


}