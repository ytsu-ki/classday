package cn.liubai.planner;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Planner data on disk, in app-private storage.
 *
 * Every write goes to a temporary file that is flushed to the device and then renamed over
 * the current file, so a crash or power loss leaves either the old or the new version, never a
 * half-written one. The version before each write is kept as state.prev.json, and one copy per
 * day is kept in snapshots/ for recovery. Plain Java so it can be tested on the JVM.
 */
final class StateFiles {
    static final int MAX_BYTES = 20 * 1024 * 1024;
    private static final Pattern DAY = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");

    private final File dir;
    private final File snapshots;

    StateFiles(File dir) {
        this.dir = dir;
        this.snapshots = new File(dir, "snapshots");
    }

    private File current() { return new File(dir, "state.json"); }
    private File previous() { return new File(dir, "state.prev.json"); }

    /** The latest data, or null when nothing has been saved yet. */
    String read() throws IOException {
        File file = current();
        if (file.exists()) return readText(file);
        // A missing current file with a previous copy means an interrupted first rename.
        return previous().exists() ? readText(previous()) : null;
    }

    String readPrevious() throws IOException {
        return previous().exists() ? readText(previous()) : null;
    }

    void write(String data) throws IOException {
        byte[] bytes = encode(data);
        ensureDir(dir);
        File file = current();
        if (file.exists()) {
            File copy = new File(dir, "state.prev.json.tmp");
            copyFile(file, copy);
            replace(copy, previous());
        }
        File temporary = new File(dir, "state.json.tmp");
        writeSynced(temporary, bytes);
        replace(temporary, file);
    }

    void snapshot(String data, String day, int keep) throws IOException {
        if (!DAY.matcher(day).matches()) throw new IllegalArgumentException("Invalid snapshot day");
        byte[] bytes = encode(data);
        ensureDir(snapshots);
        File temporary = new File(snapshots, day + ".json.tmp");
        writeSynced(temporary, bytes);
        replace(temporary, new File(snapshots, day + ".json"));
        List<String> days = snapshotDays();
        for (int i = Math.max(0, keep); i < days.size(); i++) {
            //noinspection ResultOfMethodCallIgnored
            new File(snapshots, days.get(i) + ".json").delete();
        }
    }

    /** Snapshot days, newest first. */
    List<String> snapshotDays() {
        String[] names = snapshots.list();
        List<String> days = new ArrayList<>();
        if (names == null) return days;
        Arrays.sort(names);
        for (int i = names.length - 1; i >= 0; i--) {
            String name = names[i];
            if (name.endsWith(".json") && DAY.matcher(name.substring(0, name.length() - 5)).matches()) days.add(name.substring(0, name.length() - 5));
        }
        return days;
    }

    long snapshotSize(String day) {
        return new File(snapshots, day + ".json").length();
    }

    String readSnapshot(String day) throws IOException {
        if (!DAY.matcher(day).matches()) throw new IllegalArgumentException("Invalid snapshot day");
        File file = new File(snapshots, day + ".json");
        if (!file.exists()) throw new IOException("Snapshot not found");
        return readText(file);
    }

    static byte[] encode(String data) {
        if (data == null || data.isEmpty()) throw new IllegalArgumentException("Nothing to save");
        byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BYTES) throw new IllegalArgumentException("Data exceeds 20 MB");
        return bytes;
    }

    private static void ensureDir(File directory) throws IOException {
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Could not create " + directory);
    }

    private static void writeSynced(File file, byte[] bytes) throws IOException {
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(bytes);
            output.flush();
            output.getFD().sync();
        }
    }

    private static void copyFile(File from, File to) throws IOException {
        try (InputStream input = new FileInputStream(from); FileOutputStream output = new FileOutputStream(to)) {
            copy(input, output);
            output.flush();
            output.getFD().sync();
        }
    }

    static void copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[16 * 1024];
        int length;
        while ((length = input.read(buffer)) != -1) output.write(buffer, 0, length);
    }

    /** rename(2) replaces the target atomically on the same file system. */
    private static void replace(File from, File to) throws IOException {
        if (!from.renameTo(to)) throw new IOException("Could not replace " + to.getName());
    }

    private static String readText(File file) throws IOException {
        if (file.length() > MAX_BYTES) throw new IOException("Stored data is unexpectedly large");
        try (InputStream input = new FileInputStream(file)) {
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream((int) file.length());
            copy(input, output);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
}
