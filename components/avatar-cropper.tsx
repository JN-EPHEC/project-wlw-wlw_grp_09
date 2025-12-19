import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { Colors, Radius, Spacing } from '@/app/ui/theme';
import { GradientButton } from '@/components/ui/gradient-button';

const AnimatedImage = Animated.createAnimatedComponent(RNImage);
const OUTPUT_SIZE = 720;

type CropValues = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

const clampTranslation = (
  value: number,
  scale: number,
  dimension: number,
  cropSize: number
) => {
  'worklet';
  const limit = Math.max(0, (dimension * scale - cropSize) / 2);
  if (value > limit) return limit;
  if (value < -limit) return -limit;
  return value;
};

const cropNativeImage = async (uri: string, crop: CropValues) => {
  const NativeImageEditor =
    Platform.OS === 'web'
      ? null
      : // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('react-native/Libraries/Image/NativeImageEditor').default;

  if (!NativeImageEditor) {
    throw new Error('NativeImageEditorUnavailable');
  }

  return new Promise<string>((resolve, reject) => {
    NativeImageEditor.cropImage(
      uri,
      {
        offset: { x: Math.max(0, Math.round(crop.originX)), y: Math.max(0, Math.round(crop.originY)) },
        size: { width: Math.round(crop.width), height: Math.round(crop.height) },
        displaySize: { width: OUTPUT_SIZE, height: OUTPUT_SIZE },
        resizeMode: 'contain',
      },
      (resultUri: string) => resolve(resultUri),
      (error: unknown) => reject(typeof error === 'string' ? new Error(error) : error ?? new Error('crop-failed'))
    );
  });
};

const cropWebImage = async (uri: string, crop: CropValues) => {
  if (typeof document === 'undefined') {
    throw new Error('WebCropUnavailable');
  }
  return new Promise<string>((resolve, reject) => {
    const CanvasImage: any = (typeof window !== 'undefined' && window.Image) || (typeof Image !== 'undefined' ? Image : null);
    if (!CanvasImage) {
      reject(new Error('ImageCtorUnavailable'));
      return;
    }
    const canvasImage = new CanvasImage();
    canvasImage.crossOrigin = 'anonymous';
    canvasImage.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('CanvasUnavailable'));
        return;
      }
      ctx.drawImage(
        canvasImage,
        crop.originX,
        crop.originY,
        crop.width,
        crop.height,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE
      );
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    canvasImage.onerror = () => reject(new Error('ImageLoadFailed'));
    canvasImage.src = uri;
  });
};

export type AvatarCropperProps = {
  uri: string | null;
  visible: boolean;
  onCancel: () => void;
  onConfirm: (croppedUri: string) => void;
};

export function AvatarCropperModal({ uri, visible, onCancel, onConfirm }: AvatarCropperProps) {
  const { width: screenWidth } = useWindowDimensions();
  const cropSize = Math.min(screenWidth - Spacing.lg * 2, 360);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minScale = useSharedValue(1);
  const maxScale = useSharedValue(4);
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const translationX = useSharedValue(0);
  const translationY = useSharedValue(0);
  const imageWidth = useSharedValue(0);
  const imageHeight = useSharedValue(0);
  const cropBoxSize = useSharedValue(cropSize);

  useEffect(() => {
    cropBoxSize.value = cropSize;
  }, [cropSize, cropBoxSize]);

  useEffect(() => {
    if (!uri) {
      setImageSize(null);
      setError(null);
      return;
    }
    RNImage.getSize(
      uri,
      (width, height) => {
        setImageSize({ width, height });
        setError(null);
      },
      () => {
        setImageSize(null);
        setError("Impossible de charger l'image sélectionnée.");
      }
    );
  }, [uri]);

  useEffect(() => {
    if (!imageSize) return;
    const base = cropSize / Math.min(imageSize.width, imageSize.height);
    minScale.value = base;
    maxScale.value = base * 4;
    scale.value = base;
    startScale.value = base;
    translationX.value = 0;
    translationY.value = 0;
    imageWidth.value = imageSize.width;
    imageHeight.value = imageSize.height;
  }, [
    cropSize,
    imageSize,
    imageHeight,
    imageWidth,
    maxScale,
    minScale,
    scale,
    startScale,
    translationX,
    translationY,
  ]);

  const baseImageStyle = useMemo(() => {
    if (!imageSize) return null;
    const base = cropSize / Math.min(imageSize.width, imageSize.height);
    return {
      width: imageSize.width * base,
      height: imageSize.height * base,
    };
  }, [cropSize, imageSize]);

  const animatedImageStyle = useAnimatedStyle(() => {
    const base = minScale.value || 1;
    return {
      transform: [
        { translateX: translationX.value },
        { translateY: translationY.value },
        { scale: scale.value / base },
      ],
    };
  });

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onChange((event) => {
          translationX.value = clampTranslation(
            translationX.value + event.changeX,
            scale.value,
            imageWidth.value,
            cropBoxSize.value
          );
          translationY.value = clampTranslation(
            translationY.value + event.changeY,
            scale.value,
            imageHeight.value,
            cropBoxSize.value
          );
        })
        .enabled(!!uri && !!imageSize),
    [cropBoxSize, imageHeight, imageSize, imageWidth, scale, translationX, translationY, uri]
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          startScale.value = scale.value;
        })
        .onUpdate((event) => {
          const raw = startScale.value * event.scale;
          const next = Math.max(minScale.value, Math.min(maxScale.value, raw));
          scale.value = next;
          translationX.value = clampTranslation(
            translationX.value,
            next,
            imageWidth.value,
            cropBoxSize.value
          );
          translationY.value = clampTranslation(
            translationY.value,
            next,
            imageHeight.value,
            cropBoxSize.value
          );
        })
        .enabled(!!uri && !!imageSize),
    [
      cropBoxSize,
      imageHeight,
      imageSize,
      imageWidth,
      maxScale,
      minScale,
      scale,
      startScale,
      translationX,
      translationY,
    ]
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(panGesture, pinchGesture),
    [panGesture, pinchGesture]
  );

  const computeCropValues = useCallback((): CropValues | null => {
    if (!imageSize) return null;
    const currentScale = scale.value;
    const currentX = translationX.value;
    const currentY = translationY.value;
    const displayedWidth = imageSize.width * currentScale;
    const displayedHeight = imageSize.height * currentScale;
    const offsetX = (cropSize - displayedWidth) / 2 + currentX;
    const offsetY = (cropSize - displayedHeight) / 2 + currentY;
    const width = cropSize / currentScale;
    const height = cropSize / currentScale;
    let originX = -offsetX / currentScale;
    let originY = -offsetY / currentScale;
    const maxX = imageSize.width - width;
    const maxY = imageSize.height - height;
    originX = Math.min(Math.max(originX, 0), Math.max(0, maxX));
    originY = Math.min(Math.max(originY, 0), Math.max(0, maxY));
    return {
      originX,
      originY,
      width: Math.min(width, imageSize.width),
      height: Math.min(height, imageSize.height),
    };
  }, [cropSize, imageSize]);

  const handleConfirm = useCallback(async () => {
    if (!uri || !imageSize) return;
    const cropValues = computeCropValues();
    if (!cropValues) {
      Alert.alert('Photo introuvable', 'Rouvre ta galerie pour sélectionner une image.');
      return;
    }
    try {
      setLoading(true);
      const croppedUri =
        Platform.OS === 'web'
          ? await cropWebImage(uri, cropValues)
          : await cropNativeImage(uri, cropValues);
      onConfirm(croppedUri);
    } catch (err) {
      console.warn('crop failed', err);
      Alert.alert('Recadrage impossible', 'Nous ne pouvons pas rogner cette photo. Réessaie.');
    } finally {
      setLoading(false);
    }
  }, [computeCropValues, imageSize, onConfirm, uri]);

  const canConfirm = !!uri && !!imageSize && !loading && !error;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} transparent>
      <View style={styles.backdrop}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Ajuster ta photo</Text>
            <Text style={styles.subtitle}>Pince pour zoomer et glisse pour centrer ton visage.</Text>
            <View style={[styles.cropBox, { width: cropSize, height: cropSize }]}>
              {uri && imageSize && baseImageStyle ? (
                <GestureDetector gesture={composedGesture}>
                  <AnimatedImage
                    source={{ uri }}
                    style={[styles.image, baseImageStyle, animatedImageStyle]}
                    resizeMode="cover"
                  />
                </GestureDetector>
              ) : error ? (
                <View style={styles.errorState}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : (
                <View style={styles.loaderState}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              )}
              <View pointerEvents="none" style={styles.cropOverlay}>
                <View style={[styles.gridRow, { top: '33.33%' }]} />
                <View style={[styles.gridRow, { top: '66.66%' }]} />
                <View style={[styles.gridColumn, { left: '33.33%' }]} />
                <View style={[styles.gridColumn, { left: '66.66%' }]} />
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable onPress={onCancel} style={styles.cancelButton} disabled={loading}>
                <Text style={styles.cancelText}>Revenir</Text>
              </Pressable>
              <GradientButton
                title={loading ? 'Rognage…' : 'Rogner'}
                onPress={handleConfirm}
                disabled={!canConfirm}
                style={styles.confirmButton}
              />
            </View>
          </View>
        </GestureHandlerRootView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ink,
  },
  subtitle: {
    color: Colors.gray600,
    fontSize: 13,
    lineHeight: 18,
  },
  cropBox: {
    alignSelf: 'center',
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  cropOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  gridRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  gridColumn: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  loaderState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  errorText: {
    color: Colors.danger,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gray300,
    alignItems: 'center',
  },
  cancelText: {
    color: Colors.gray700,
    fontWeight: '700',
  },
  confirmButton: {
    flex: 1,
  },
});
