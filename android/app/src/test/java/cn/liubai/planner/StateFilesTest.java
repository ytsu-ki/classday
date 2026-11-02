package cn.liubai.planner;

import static org.junit.Assert.*;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class StateFilesTest {
    @Rule public TemporaryFolder folder = new TemporaryFolder();

    @Test
    public void startsEmptyThenKeepsLatestAndPrevious() throws IOException {
        StateFiles files = new StateFiles(new File(folder.getRoot(), "planner"));
        assertNull(files.read());
        assertNull(files.readPrevious());
        files.write("{\"v\":1}");
        files.write("{\"v\":2,\"text\":\"Run 🏃\"}");
        assertEquals("{\"v\":2,\"text\":\"Run 🏃\"}", files.read());
        assertEquals("{\"v\":1}", files.readPrevious());
        assertFalse(new File(folder.getRoot(), "planner/state.json.tmp").exists());
    }

    @Test
    public void ignoresAnInterruptedWriteAndRecoversAMissingCurrentFile() throws IOException {
        File dir = new File(folder.getRoot(), "planner");
        StateFiles files = new StateFiles(dir);
        files.write("{\"v\":1}");
        files.write("{\"v\":2}");
        // A crash before the rename leaves only a stray temporary file.
        try (FileOutputStream out = new FileOutputStream(new File(dir, "state.json.tmp"))) {
            out.write("{\"v\":3,\"trunc".getBytes(StandardCharsets.UTF_8));
        }
        assertEquals("{\"v\":2}", files.read());
        assertTrue(new File(dir, "state.json").delete());
        assertEquals("{\"v\":1}", files.read());
    }

    @Test
    public void keepsOnlyTheNewestDailyCopies() throws IOException {
        StateFiles files = new StateFiles(new File(folder.getRoot(), "planner"));
        for (int day = 1; day <= 9; day++) files.snapshot("{\"day\":" + day + "}", String.format("2026-10-%02d", day), 7);
        files.snapshot("{\"day\":\"again\"}", "2026-10-09", 7);
        assertEquals(Arrays.asList("2026-10-09", "2026-10-08", "2026-10-07", "2026-10-06", "2026-10-05", "2026-10-04", "2026-10-03"), files.snapshotDays());
        assertEquals("{\"day\":\"again\"}", files.readSnapshot("2026-10-09"));
        assertTrue(files.snapshotSize("2026-10-09") > 0);
    }

    @Test
    public void rejectsBadInputWithoutTouchingSavedData() throws IOException {
        StateFiles files = new StateFiles(new File(folder.getRoot(), "planner"));
        files.write("{\"keep\":true}");
        assertThrows(IllegalArgumentException.class, () -> files.write(null));
        assertThrows(IllegalArgumentException.class, () -> files.write(""));
        assertThrows(IllegalArgumentException.class, () -> files.snapshot("{}", "../../escape", 7));
        assertThrows(IllegalArgumentException.class, () -> files.readSnapshot("../state"));
        assertThrows(IllegalArgumentException.class, () -> StateFiles.encode("a".repeat(StateFiles.MAX_BYTES + 1)));
        assertEquals("{\"keep\":true}", files.read());
    }
}
