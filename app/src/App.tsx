import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';

import { analyzeProduct } from './api';
import { BrandTitle, GlassCard, HeaderIcon, PrimaryButton } from './components';
import { colors } from './theme';
import type { AnalysisResult, PickedImage } from './types';

type Screen = 'splash' | 'home' | 'processing' | 'result';

const emptyResult: AnalysisResult = {
  analysisStatus: 'analyzed',
  rating: 0,
  decision: 'CONSIDER',
  reason: 'Scan a product label to get a rating.',
  trustScore: 0,
  healthScore: 0,
  valueScore: 0,
  ingredientsAnalysis: [],
  warnings: [],
  expiryAnalysis: 'No label has been analyzed yet.',
  alternativeProduct: null,
  nutrition: [],
  risks: [],
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [result, setResult] = useState<AnalysisResult>(emptyResult);

  useEffect(() => {
    const timer = setTimeout(() => setScreen('home'), 1700);
    return () => clearTimeout(timer);
  }, []);

  const startAnalysis = (pickedImage: PickedImage) => {
    setImage(pickedImage);
    setScreen('processing');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {screen === 'splash' && <SplashScreen />}
      {screen === 'home' && <HomeScreen onPick={startAnalysis} />}
      {screen === 'processing' && image && (
        <ProcessingScreen
          image={image}
          onBack={() => setScreen('home')}
          onDone={(nextResult) => {
            setResult(nextResult);
            setScreen('result');
          }}
        />
      )}
      {screen === 'result' && <ResultScreen result={result} onBack={() => setScreen('home')} />}
    </SafeAreaView>
  );
}

function SplashScreen() {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  return (
    <View style={styles.splash}>
      <Animated.View style={[styles.splashContent, { opacity, transform: [{ scale }] }]}>
        <LinearGradient colors={[colors.violet, colors.deepViolet]} style={styles.splashIcon}>
          <MaterialIcons name="auto-awesome" color="#FFFFFF" size={38} />
        </LinearGradient>
        <BrandTitle size={30} />
        <Text style={styles.splashTagline}>Scan • Rate • Decide</Text>
      </Animated.View>
    </View>
  );
}

function HomeScreen({ onPick }: { onPick: (image: PickedImage) => void }) {
  const pick = async (source: 'camera' | 'gallery') => {
    try {
      if (source === 'camera' && Platform.OS === 'web') {
        const captured = await captureWithMobileBrowserCamera();
        if (captured) onPick(captured);
        return;
      }

      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera unavailable', 'Camera permission was denied. Use Upload Image to choose a product label instead.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Allow photo access to upload a product label image.');
          return;
        }
      }

      const response =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.88 })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.88 });

      if (response.canceled || !response.assets[0]) return;
      const asset = response.assets[0];
      onPick({ uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType });
    } catch {
      Alert.alert('Image picker error', 'Could not open image picker. Check device permissions.');
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.homeHeader}>
        <HeaderIcon name="menu" />
        <HeaderIcon name="notifications-none" />
      </View>
      <BrandTitle />
      <Text style={styles.tagline}>Scan. Rate. Decide.</Text>
      <View style={styles.homeCenter}>
        <GlassCard contentStyle={styles.scanCard}>
          <View style={styles.cameraStack}>
            <View style={styles.cameraHalo} />
            <LinearGradient colors={[colors.violet, colors.deepViolet]} style={styles.cameraCircle}>
              <MaterialIcons name="photo-camera" color="#FFFFFF" size={42} />
            </LinearGradient>
            <MaterialIcons name="auto-awesome" color="#B6A8FF" size={18} style={styles.sparkOne} />
            <MaterialIcons name="auto-awesome" color="#C8BEFF" size={15} style={styles.sparkTwo} />
          </View>
          <Text style={styles.scanTitle}>Scan Any Product</Text>
          <Text style={styles.scanSubtitle}>Get AI rating in seconds</Text>
          <View style={styles.buttonGap}>
            <PrimaryButton icon="photo-camera" label="Take Photo" onPress={() => pick('camera')} />
          </View>
          <PrimaryButton icon="image" label="Upload Image" filled={false} onPress={() => pick('gallery')} />
        </GlassCard>
      </View>
      <BottomNav />
    </View>
  );
}

function captureWithMobileBrowserCamera(): Promise<PickedImage | null> {
  if (typeof document === 'undefined') {
    Alert.alert('Camera unavailable', 'This browser does not support camera capture. Use Upload Image instead.');
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';

    const cleanup = () => {
      input.remove();
      input.onchange = null;
    };

    input.onchange = () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }

      resolve({
        uri: URL.createObjectURL(file),
        fileName: file.name || `camera-capture-${Date.now()}.jpg`,
        mimeType: file.type || 'image/jpeg',
      });
    };

    document.body.appendChild(input);
    input.click();
  });
}

function ProcessingScreen({
  image,
  onBack,
  onDone,
}: {
  image: PickedImage;
  onBack: () => void;
  onDone: (result: AnalysisResult) => void;
}) {
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const progress = useRef(new Animated.Value(0.08)).current;

  const run = async () => {
    setError(null);
    setActiveStep(0);
    progress.setValue(0.08);
    Animated.timing(progress, { toValue: 0.92, duration: 3000, useNativeDriver: false }).start();

    try {
      const nextResult = await analyzeProduct(image);
      onDone(nextResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Analysis failed. Please try again.');
    }
  };

  useEffect(() => {
    const stepTimer = setInterval(() => setActiveStep((value) => Math.min(value + 1, 4)), 650);
    run();
    return () => clearInterval(stepTimer);
  }, []);

  return (
    <View style={styles.screen}>
      <HeaderIcon name="arrow-back-ios" onPress={onBack} />
      <Text style={styles.processingTitle}>Analyzing Product...</Text>
      <Text style={styles.processingSubtitle}>{error || 'Please wait a few seconds'}</Text>
      <View style={styles.previewWrap}>
        <Animated.View
          style={[
            styles.progressRing,
            {
              borderColor: progress.interpolate({
                inputRange: [0.08, 0.92],
                outputRange: ['rgba(99,70,255,0.2)', colors.violet],
              }) as unknown as string,
            },
          ]}
        >
          <Image source={{ uri: image.uri }} style={styles.previewImage} />
        </Animated.View>
      </View>
      <GlassCard contentStyle={styles.stepsCard}>
        <Step icon="photo-camera" title="Image Processing" subtitle="Extracting text from image" done={activeStep >= 1} />
        <Step icon="article" title="Reading Label" subtitle="Detecting ingredients & info" done={activeStep >= 2} />
        <Step icon="hub" title="Detecting Ingredients" subtitle="Analyzing components" done={activeStep >= 3} />
        <Step icon="monitor-heart" title="Calculating Rating" subtitle="Assessing quality & safety" done={activeStep >= 4} last />
      </GlassCard>
      <View style={styles.processingSpacer} />
      <GlassCard color="#F4F2FF" contentStyle={styles.tipCard}>
        <MaterialIcons name={error ? 'error-outline' : 'lightbulb-outline'} color={colors.violet} size={28} />
        <Text style={styles.tipText}>{error || 'For best results, take a clear photo of the back label.'}</Text>
        {error && (
          <Pressable onPress={run} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        )}
      </GlassCard>
    </View>
  );
}

function ResultScreen({ result, onBack }: { result: AnalysisResult; onBack: () => void }) {
  if (result.analysisStatus === 'unrecognized_image') {
    return (
      <ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultContent}>
        <View style={styles.resultHeader}>
          <HeaderIcon name="arrow-back-ios" onPress={onBack} />
          <Text style={styles.resultTitle}>Image Not Recognized</Text>
          <View style={styles.headerSpacer} />
        </View>
        <GlassCard color="#FFF8E7" borderColor="#FFE3A3" contentStyle={styles.unrecognizedCard}>
          <MaterialIcons name="image-search" color={colors.warning} size={46} />
          <Text style={styles.unrecognizedTitle}>Upload a clear product label</Text>
          <Text style={styles.unrecognizedBody}>{result.reason}</Text>
        </GlassCard>
      </ScrollView>
    );
  }

  const decision = result.decision.toUpperCase();
  const decisionColor = decision === 'BUY' ? colors.success : decision === 'CONSIDER' ? colors.warning : colors.danger;

  return (
    <ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultContent}>
      <View style={styles.resultHeader}>
        <HeaderIcon name="arrow-back-ios" onPress={onBack} />
        <Text style={styles.resultTitle}>Result</Text>
        <HeaderIcon name="ios-share" />
      </View>
      <GlassCard contentStyle={styles.ratingCard}>
        <Text style={styles.ratingLabel}>Overall Rating</Text>
        <Text style={styles.ratingValue}>
          {result.rating.toFixed(1)}
          <Text style={styles.ratingMax}> /5</Text>
        </Text>
        <Stars rating={result.rating} />
      </GlassCard>
      <GlassCard color="#E6FAF5" borderColor="#C6EFE5" contentStyle={styles.decisionCard}>
        <View style={styles.decisionIconWrap}>
          <MaterialIcons name={decisionIcon(decision)} color={decisionColor} size={32} />
        </View>
        <Text style={[styles.decisionText, { color: decisionColor }]}>{decision}</Text>
        <Text style={styles.reason}>{result.reason}</Text>
      </GlassCard>
      <View style={styles.scoreRow}>
        <ScoreCard label="Trust Score" value={result.trustScore} color={colors.success} />
        <ScoreCard label="Health Score" value={result.healthScore} color="#1767E8" />
        <ScoreCard label="Value Score" value={result.valueScore} color="#FFA000" />
      </View>
      <Expandable title="Ingredients" items={result.ingredientsAnalysis} trailing="Good" />
      <Expandable title="Nutrition" items={result.nutrition} trailing="Good" />
      <Expandable title="Risk Analysis" items={result.risks} trailing={result.warnings.length ? 'Watch' : 'Average'} />
      <Expandable title="Expiry" items={[result.expiryAnalysis]} trailing="Safe" />
      {result.alternativeProduct && <AlternativeCard product={result.alternativeProduct} />}
      {result.warnings.length > 0 && <WarningCard warnings={result.warnings} />}
    </ScrollView>
  );
}

function BottomNav() {
  return (
    <GlassCard contentStyle={styles.navCard}>
      <NavItem icon="home" label="Scan" active />
      <NavItem icon="bar-chart" label="Analyze" />
      <NavItem icon="info-outline" label="Info" />
    </GlassCard>
  );
}

function NavItem({ icon, label, active = false }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; active?: boolean }) {
  return (
    <View style={styles.navItem}>
      <MaterialIcons name={icon} color={active ? colors.violet : colors.ink} size={25} />
      <Text style={[styles.navLabel, { color: active ? colors.violet : colors.ink, fontWeight: active ? '800' : '600' }]}>{label}</Text>
    </View>
  );
}

function Step({
  icon,
  title,
  subtitle,
  done,
  last = false,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  done: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.step, last && styles.lastStep]}>
      <MaterialIcons name={icon} color={colors.violet} size={26} />
      <View style={styles.stepText}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepSubtitle}>{subtitle}</Text>
      </View>
      {done ? <MaterialIcons name="check-circle" color={colors.violet} size={24} /> : <ActivityIndicator color={colors.violet} />}
    </View>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <View style={styles.stars}>
      {Array.from({ length: 5 }, (_, index) => {
        const icon = rating >= index + 1 ? 'star' : rating > index ? 'star-half' : 'star-border';
        return <MaterialIcons key={index} name={icon} color="#FFB000" size={34} />;
      })}
    </View>
  );
}

function ScoreCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <GlassCard radius={14} contentStyle={styles.scoreCard}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <Text style={[styles.scoreValue, { color }]}>
        {value}
        <Text style={styles.scoreMax}>/100</Text>
      </Text>
    </GlassCard>
  );
}

function Expandable({ title, items, trailing }: { title: string; items: string[]; trailing: string }) {
  const [open, setOpen] = useState(false);

  return (
    <GlassCard radius={16} contentStyle={styles.expandableCard}>
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.expandableHeader}>
        <Text style={styles.expandableTitle}>{title}</Text>
        <View style={styles.expandableTrailing}>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{trailing}</Text>
          </View>
          <MaterialIcons name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} color={colors.ink} size={24} />
        </View>
      </Pressable>
      {open && <Text style={styles.expandableBody}>{items.length ? items.join('\n') : 'No issue detected.'}</Text>}
    </GlassCard>
  );
}

function AlternativeCard({ product }: { product: NonNullable<AnalysisResult['alternativeProduct']> }) {
  return (
    <GlassCard color="#FFF8E8" borderColor="#F5E4B7" contentStyle={styles.alternativeCard}>
      <LinearGradient colors={['#143C9A', '#E72232']} style={styles.altImage}>
        <MaterialIcons name="inventory-2" color="#FFFFFF" size={34} />
      </LinearGradient>
      <View style={styles.altText}>
        <Text style={styles.altHeading}>Better Choice</Text>
        <View style={styles.altNameRow}>
          <Text style={styles.altName}>{product.name}</Text>
          <Text style={styles.altRating}>{product.rating.toFixed(1)}/5 ★</Text>
        </View>
        <Text style={styles.altReason}>{product.reason}</Text>
      </View>
    </GlassCard>
  );
}

function WarningCard({ warnings }: { warnings: string[] }) {
  return (
    <GlassCard color="#FFF0F0" borderColor="#FFD3D3" contentStyle={styles.warningCard}>
      <MaterialIcons name="warning-amber" color={colors.danger} size={34} />
      <View style={styles.warningTextWrap}>
        <Text style={styles.warningTitle}>Watch Out</Text>
        <Text style={styles.warningBody}>{warnings.join('\n')}</Text>
      </View>
    </GlassCard>
  );
}

function decisionIcon(decision: string): keyof typeof MaterialIcons.glyphMap {
  if (decision === 'BUY') return 'check';
  if (decision === 'CONSIDER') return 'warning-amber';
  return 'close';
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 18,
    paddingTop: 18,
  },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashContent: {
    alignItems: 'center',
  },
  splashIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  splashTagline: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
  },
  homeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  tagline: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  homeCenter: {
    flex: 1,
    justifyContent: 'center',
    marginVertical: 24,
  },
  scanCard: {
    alignItems: 'center',
    paddingBottom: 28,
    paddingHorizontal: 22,
    paddingTop: 36,
  },
  cameraStack: {
    width: 136,
    height: 136,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraHalo: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(99,70,255,0.09)',
  },
  cameraCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkOne: {
    position: 'absolute',
    right: 9,
    top: 12,
  },
  sparkTwo: {
    position: 'absolute',
    bottom: 31,
    left: 9,
  },
  scanTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 18,
  },
  scanSubtitle: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 30,
    marginTop: 8,
  },
  buttonGap: {
    width: '100%',
    marginBottom: 16,
  },
  navCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  navItem: {
    alignItems: 'center',
  },
  navLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  processingTitle: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 6,
    textAlign: 'center',
  },
  processingSubtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  previewWrap: {
    alignItems: 'center',
    marginVertical: 30,
  },
  progressRing: {
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 6,
    padding: 28,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 87,
    backgroundColor: colors.surface,
  },
  stepsCard: {
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  step: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 18,
  },
  lastStep: {
    marginBottom: 0,
  },
  stepText: {
    flex: 1,
    marginLeft: 16,
  },
  stepTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  stepSubtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  processingSpacer: {
    flex: 1,
  },
  tipCard: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  tipText: {
    color: colors.deepViolet,
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    marginLeft: 16,
  },
  retryButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  retryText: {
    color: colors.violet,
    fontWeight: '800',
  },
  resultScroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  resultContent: {
    paddingBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  resultHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerSpacer: {
    height: 44,
    width: 44,
  },
  unrecognizedCard: {
    alignItems: 'center',
    marginTop: 24,
  },
  unrecognizedTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 18,
    textAlign: 'center',
  },
  unrecognizedBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    textAlign: 'center',
  },
  resultTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  ratingCard: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  ratingLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  ratingValue: {
    color: colors.ink,
    fontSize: 60,
    fontWeight: '900',
    marginTop: 8,
  },
  ratingMax: {
    fontSize: 24,
  },
  stars: {
    flexDirection: 'row',
    marginTop: 4,
  },
  decisionCard: {
    alignItems: 'center',
    marginTop: 16,
  },
  decisionIconWrap: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  decisionText: {
    fontSize: 27,
    fontWeight: '900',
    marginTop: 12,
  },
  reason: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 16,
  },
  scoreCard: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 14,
  },
  scoreLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  scoreValue: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 6,
  },
  scoreMax: {
    color: colors.ink,
    fontSize: 14,
  },
  expandableCard: {
    marginBottom: 10,
    padding: 0,
  },
  expandableHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 3,
  },
  expandableTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
  },
  expandableTrailing: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  statusPill: {
    backgroundColor: '#E8F7F2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  statusText: {
    color: '#007F63',
    fontSize: 12,
    fontWeight: '800',
  },
  expandableBody: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 22,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  alternativeCard: {
    flexDirection: 'row',
    marginTop: 6,
  },
  altImage: {
    alignItems: 'center',
    borderRadius: 12,
    height: 96,
    justifyContent: 'center',
    width: 72,
  },
  altText: {
    flex: 1,
    marginLeft: 18,
  },
  altHeading: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  altNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 14,
  },
  altName: {
    color: colors.ink,
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
  },
  altRating: {
    color: '#FFA000',
    fontWeight: '900',
  },
  altReason: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  warningCard: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginTop: 16,
  },
  warningTextWrap: {
    flex: 1,
    marginLeft: 16,
  },
  warningTitle: {
    color: colors.danger,
    fontSize: 17,
    fontWeight: '900',
  },
  warningBody: {
    color: colors.ink,
    lineHeight: 21,
    marginTop: 8,
  },
});
