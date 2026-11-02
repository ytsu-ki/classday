package cn.liubai.planner;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class BackupPayloadTest {
    @Test
    public void preservesUnicodeAndRawRecoveryData() {
        String raw = "{\"plan\": \"Exercise 🏃\"}\n";
        assertEquals(raw, new String(BackupPlugin.backupBytes(raw), StandardCharsets.UTF_8));
        // Recovery export must also preserve damaged JSON without silently rewriting it.
        assertEquals("{unfinished", new String(BackupPlugin.backupBytes("{unfinished"), StandardCharsets.UTF_8));
    }

    @Test
    public void rejectsMissingAndOversizedPayloads() {
        assertThrows(IllegalArgumentException.class, () -> BackupPlugin.backupBytes(null));
        assertThrows(IllegalArgumentException.class, () -> BackupPlugin.backupBytes(""));
        assertThrows(IllegalArgumentException.class, () -> BackupPlugin.backupBytes("€".repeat(4 * 1024 * 1024)));
        assertEquals(10 * 1024 * 1024, BackupPlugin.backupBytes("a".repeat(10 * 1024 * 1024)).length);
    }

    @Test
    public void copiesWholeSnapshotAndPropagatesWriteFailure() throws IOException {
        byte[] data = BackupPlugin.backupBytes("Classday 🏃\n".repeat(2000));
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        BackupPlugin.copyBackup(new ByteArrayInputStream(data), output);
        assertArrayEquals(data, output.toByteArray());
        OutputStream failed = new OutputStream() {
            @Override public void write(int value) throws IOException { throw new IOException("Disk full"); }
        };
        assertThrows(IOException.class, () -> BackupPlugin.copyBackup(new ByteArrayInputStream(data), failed));
    }
}
