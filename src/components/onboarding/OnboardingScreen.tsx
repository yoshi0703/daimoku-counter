import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "@/src/contexts/ThemeContext";
import { FONT_SIZE, SPACING } from "@/src/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Props {
  onComplete: () => void;
}

// ─── Page 1: 波形アニメーション ───
function WaveformVisual({ color }: { color: string }) {
  const bars = [0.4, 0.7, 1.0, 0.6, 0.9, 0.5, 0.8, 0.3, 0.7, 0.5, 0.9, 0.6];

  return (
    <View style={waveStyles.container}>
      {bars.map((height, i) => (
        <WaveBar key={i} index={i} maxHeight={height} color={color} />
      ))}
    </View>
  );
}

function WaveBar({
  index,
  maxHeight,
  color,
}: {
  index: number;
  maxHeight: number;
  color: string;
}) {
  const scale = useSharedValue(0.3);

  useEffect(() => {
    scale.value = withDelay(
      index * 80,
      withRepeat(
        withSequence(
          withTiming(maxHeight, {
            duration: 400 + index * 30,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0.2, {
            duration: 400 + index * 30,
            easing: Easing.inOut(Easing.ease),
          }),
        ),
        -1,
        true,
      ),
    );
  }, [index, maxHeight, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 4,
          height: 40,
          borderRadius: 2,
          backgroundColor: color,
          opacity: 0.7,
        },
        animatedStyle,
      ]}
    />
  );
}

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 44,
    marginTop: SPACING.md,
  },
});

// ─── Page 2: プログレスリング（RN Animatedで描画） ───
function ProgressRingVisual({ color, trackColor }: { color: string; trackColor: string }) {
  const size = 100;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference * 0.25; // 75% fill

  return (
    <View style={{ width: size, height: size, marginTop: SPACING.md }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={targetOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        <Animated.Text
          entering={FadeIn.delay(1200).duration(600)}
          style={{ fontSize: FONT_SIZE.xl, fontWeight: "700" as const, color }}
        >
          75%
        </Animated.Text>
      </View>
    </View>
  );
}

// ─── Page 3: パルスボタン ───
function PulseButton({
  onPress,
  color,
  textColor,
}: {
  onPress: () => void;
  color: string;
  textColor: string;
}) {
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [pulseScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  return (
    <Animated.View
      entering={ZoomIn.delay(300).duration(500).springify()}
      style={animatedStyle}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          {
            backgroundColor: color,
            paddingHorizontal: 48,
            paddingVertical: 18,
            borderRadius: 30,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text
          style={{
            color: textColor,
            fontSize: FONT_SIZE.lg,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          はじめる
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── ページインジケーター ───
function PageIndicator({
  total,
  current,
  activeColor,
  inactiveColor,
}: {
  total: number;
  current: number;
  activeColor: string;
  inactiveColor: string;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <Animated.View
          key={i}
          style={{
            width: i === current ? 24 : 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: i === current ? activeColor : inactiveColor,
          }}
        />
      ))}
    </View>
  );
}

// ─── メインコンポーネント ───
export function OnboardingScreen({ onComplete }: Props) {
  const { colors } = useTheme();
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const prevPageRef = useRef(0);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (page !== prevPageRef.current && page >= 0 && page < 3) {
        prevPageRef.current = page;
        setCurrentPage(page);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [],
  );

  const handleComplete = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete();
  }, [onComplete]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        page: {
          width: SCREEN_WIDTH,
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: SPACING.xl,
        },
        iconContainer: {
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: colors.surface,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: SPACING.lg,
        },
        headline: {
          fontSize: 28,
          fontWeight: "800",
          color: colors.text,
          textAlign: "center",
          marginBottom: SPACING.md,
        },
        subtext: {
          fontSize: FONT_SIZE.md,
          color: colors.textSecondary,
          textAlign: "center",
          lineHeight: 26,
          paddingHorizontal: SPACING.md,
        },
        footer: {
          paddingBottom: SPACING.xxl,
          alignItems: "center",
          gap: SPACING.lg,
        },
        skipButton: {
          paddingVertical: SPACING.sm,
          paddingHorizontal: SPACING.md,
        },
        skipText: {
          fontSize: FONT_SIZE.sm,
          color: colors.textTertiary,
        },
      }),
    [colors],
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
      >
        {/* Page 1: 唱題に集中したい */}
        <View style={styles.page}>
          <Animated.View
            entering={ZoomIn.duration(600).springify()}
            style={styles.iconContainer}
          >
            <Ionicons name="mic" size={48} color={colors.blue} />
          </Animated.View>
          <WaveformVisual color={colors.blue} />
          <View style={{ height: SPACING.xl }} />
          <Animated.Text
            entering={FadeInDown.delay(200).duration(600)}
            style={styles.headline}
          >
            声に出すだけ。
          </Animated.Text>
          <Animated.Text
            entering={FadeInUp.delay(400).duration(600)}
            style={styles.subtext}
          >
            あなたの唱題を自動で数えます。{"\n"}
            数を気にせず、祈りに集中できます。
          </Animated.Text>
        </View>

        {/* Page 2: 習慣を続けたい */}
        <View style={styles.page}>
          {currentPage >= 1 && (
            <>
              <Animated.View
                entering={ZoomIn.duration(600).springify()}
                style={styles.iconContainer}
              >
                <Ionicons name="bar-chart" size={48} color={colors.green} />
              </Animated.View>
              <ProgressRingVisual
                color={colors.green}
                trackColor={colors.border}
              />
              <View style={{ height: SPACING.xl }} />
              <Animated.Text
                entering={FadeInDown.delay(200).duration(600)}
                style={styles.headline}
              >
                毎日の積み重ねが、{"\n"}見える。
              </Animated.Text>
              <Animated.Text
                entering={FadeInUp.delay(400).duration(600)}
                style={styles.subtext}
              >
                日々の唱題記録とゴール達成が{"\n"}一目でわかります。
              </Animated.Text>
            </>
          )}
        </View>

        {/* Page 3: さあ、はじめましょう */}
        <View style={styles.page}>
          {currentPage >= 2 && (
            <>
              <Animated.View
                entering={ZoomIn.duration(600).springify()}
                style={styles.iconContainer}
              >
                <Ionicons name="heart" size={48} color={colors.orange} />
              </Animated.View>
              <View style={{ height: SPACING.xl }} />
              <Animated.Text
                entering={FadeInDown.delay(200).duration(600)}
                style={styles.headline}
              >
                さあ、はじめましょう。
              </Animated.Text>
              <Animated.Text
                entering={FadeInUp.delay(400).duration(600)}
                style={styles.subtext}
              >
                タップして唱題カウンターを{"\n"}始めます。
              </Animated.Text>
              <View style={{ height: SPACING.xl }} />
              <PulseButton
                onPress={handleComplete}
                color={colors.text}
                textColor={colors.background}
              />
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PageIndicator
          total={3}
          current={currentPage}
          activeColor={colors.text}
          inactiveColor={colors.border}
        />
        {currentPage < 2 && (
          <Pressable style={styles.skipButton} onPress={handleComplete}>
            <Text style={styles.skipText}>スキップ</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
