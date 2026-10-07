import javax.imageio.ImageIO;
import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.LinkedHashMap;
import java.util.Map;

public final class GenerateAppIcons {
    private static final Color BACKGROUND = new Color(0x29, 0xC4, 0x5A);

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            System.err.println("Uso: GenerateAppIcons.java <source.png> <output-dir>");
            System.exit(2);
        }

        File sourceFile = new File(args[0]);
        File outputDir = new File(args[1]);

        BufferedImage source = ImageIO.read(sourceFile);
        if (source == null) {
            throw new IllegalArgumentException("Nao foi possivel abrir a imagem-fonte: " + sourceFile);
        }

        if (!outputDir.exists() && !outputDir.mkdirs()) {
            throw new IllegalStateException("Nao foi possivel criar: " + outputDir);
        }

        Map<String, Integer> icons = new LinkedHashMap<>();
        icons.put("iphone-20@2x.png", 40);
        icons.put("iphone-20@3x.png", 60);
        icons.put("iphone-29@2x.png", 58);
        icons.put("iphone-29@3x.png", 87);
        icons.put("iphone-40@2x.png", 80);
        icons.put("iphone-40@3x.png", 120);
        icons.put("iphone-60@2x.png", 120);
        icons.put("iphone-60@3x.png", 180);
        icons.put("ipad-20@1x.png", 20);
        icons.put("ipad-20@2x.png", 40);
        icons.put("ipad-29@1x.png", 29);
        icons.put("ipad-29@2x.png", 58);
        icons.put("ipad-40@1x.png", 40);
        icons.put("ipad-40@2x.png", 80);
        icons.put("ipad-76@1x.png", 76);
        icons.put("ipad-76@2x.png", 152);
        icons.put("ipad-83.5@2x.png", 167);
        icons.put("appstore-1024.png", 1024);

        for (Map.Entry<String, Integer> icon : icons.entrySet()) {
            writeIcon(source, new File(outputDir, icon.getKey()), icon.getValue());
        }

        System.out.println("App Icons iOS gerados em " + outputDir.getAbsolutePath());
    }

    private static void writeIcon(BufferedImage source, File destination, int size) throws Exception {
        BufferedImage icon = new BufferedImage(size, size, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = icon.createGraphics();

        try {
            graphics.setComposite(AlphaComposite.Src);
            graphics.setColor(BACKGROUND);
            graphics.fillRect(0, 0, size, size);

            graphics.setComposite(AlphaComposite.SrcOver);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.drawImage(source, 0, 0, size, size, null);
        } finally {
            graphics.dispose();
        }

        if (!ImageIO.write(icon, "png", destination)) {
            throw new IllegalStateException("Falha ao gravar PNG: " + destination);
        }
    }
}
