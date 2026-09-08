import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { fonts } from "../../lib/theme";
import { useTheme, type Colors } from "../../lib/theme/ThemeContext";

interface CoachMessageBodyProps {
  content: string;
  isUser: boolean;
}

interface Block {
  type: "paragraph" | "bullets";
  items: string[];
}

/**
 * A reply is plain text with occasional light structure the prompt is now
 * asked for (prompt.ts) - "- " bullet lines for a multi-part answer, "**"
 * around the one or two words worth emphasizing. No markdown library: the
 * surface is small and fully controlled (this app's own coach replies, not
 * arbitrary user content), so a tiny parser here avoids a new dependency for
 * something this codebase already avoids adding when it can (see the
 * gifted-charts drop in Task 8 Phase A).
 */
function parseBlocks(content: string): Block[] {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs.map((para) => {
    const lines = para
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const bulletLines = lines.filter((l) => /^[-•]\s+/.test(l));
    if (lines.length > 1 && bulletLines.length === lines.length) {
      return { type: "bullets", items: lines.map((l) => l.replace(/^[-•]\s+/, "")) };
    }
    return { type: "paragraph", items: [lines.join(" ")] };
  });
}

function renderInline(text: string, keyPrefix: string, boldStyle: object): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((s) => s.length > 0);
  if (parts.length <= 1) return text;
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    return bold ? (
      <Text key={`${keyPrefix}-${i}`} style={boldStyle}>
        {bold[1]}
      </Text>
    ) : (
      part
    );
  });
}

export function CoachMessageBody({ content, isUser }: CoachMessageBodyProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const blocks = useMemo(() => parseBlocks(content), [content]);
  const textStyle = [styles.text, isUser && styles.textUser];
  const boldStyle = [styles.text, isUser && styles.textUser, styles.bold];

  return (
    <View style={styles.wrap}>
      {blocks.map((block, i) =>
        block.type === "bullets" ? (
          <View key={i} style={styles.bulletList}>
            {block.items.map((item, j) => (
              <View key={j} style={styles.bulletRow}>
                <Text style={textStyle}>{"•"}</Text>
                <Text style={[textStyle, styles.bulletItemText]}>{renderInline(item, `${i}-${j}`, boldStyle)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text key={i} style={textStyle}>
            {renderInline(block.items[0], `${i}`, boldStyle)}
          </Text>
        )
      )}
    </View>
  );
}

function createStyles(colors: Colors) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    text: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: colors.textPrimary },
    textUser: { color: "#fff" },
    bold: { fontFamily: fonts.bodyBold },
    bulletList: { gap: 5 },
    bulletRow: { flexDirection: "row", gap: 7 },
    bulletItemText: { flex: 1 },
  });
}
