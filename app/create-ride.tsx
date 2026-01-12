import DateTimePicker from '@react-native-community/datetimepicker';
import { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { addRide } from '@/app/services/rides';
import { GradientBackground } from '@/components/ui/gradient-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { FALLBACK_UPCOMING } from '@/app/data/driver-samples';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useDriverSecurity } from '@/hooks/use-driver-security';

const NAV_ITEMS = [
  { key: 'home', icon: 'house.fill', label: 'Home' },
  { key: 'rides', icon: 'car.fill', label: 'Rides', active: true },
  { key: 'messages', icon: 'bubble.left.and.bubble.right.fill', label: 'Messages' },
  { key: 'profile', icon: 'person.fill', label: 'Profile' },
];

const SEAT_OPTIONS = [1, 2, 3, 4];

const formatDateLabel = (date: Date | null) =>
  date
    ? date.toLocaleDateString('fr-BE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Sélectionne une date';

const formatTimeLabel = (date: Date | null) =>
  date
    ? date.toLocaleTimeString('fr-BE', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Sélectionne une heure';

export default function CreateRideScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const security = useDriverSecurity(session.email);
  const initialRide = FALLBACK_UPCOMING[0];
  const initialDate = initialRide ? new Date(initialRide.departureAt) : null;
  const initialTime = initialRide ? new Date(initialRide.departureAt) : null;
  const [departure, setDeparture] = useState(initialRide?.depart ?? '');
  const [campus, setCampus] = useState(initialRide?.destination ?? '');
  const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate);
  const [selectedTime, setSelectedTime] = useState<Date | null>(initialTime);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [places, setPlaces] = useState(initialRide ? String(initialRide.seats) : '3');
  const [seatsOpen, setSeatsOpen] = useState(false);
  const [price, setPrice] = useState(initialRide ? initialRide.price.toFixed(2) : '');
  const [notes, setNotes] = useState('');
  const [isPublishingRide, setIsPublishingRide] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const registeredPlate = security?.vehicle.plate?.trim() ?? '';

  const handlePublish = useCallback(async () => {
    if (isPublishingRide) return;
    setFormError(null);
    if (!session.email) {
      const message = 'Connecte-toi pour publier un trajet.';
      Alert.alert('Connecte-toi', message);
      setFormError(message);
      return;
    }
    if (!session.isDriver) {
      const message = 'Active ton rôle conducteur pour continuer.';
      Alert.alert('Mode conducteur requis', message);
      setFormError('Passe en mode conducteur pour publier un trajet.');
      return;
    }
    if (!registeredPlate) {
      const message = 'Ta plaque n’est pas encore enregistrée.';
      Alert.alert('Plaque manquante', message);
      setFormError('Enregistre ta plaque dans la vérification conducteur.');
      return;
    }
    if (!departure.trim()) {
      const message = 'Indique un point de départ.';
      Alert.alert('Lieu de départ requis', message);
      setFormError('Ajoute un lieu de départ.');
      return;
    }
    if (!selectedDate) {
      const message = 'Choisis une date pour ton trajet.';
      Alert.alert('Date requise', message);
      setFormError('Choisis une date.');
      return;
    }
    if (!selectedTime) {
      const message = 'Choisis une heure pour ton trajet.';
      Alert.alert('Heure requise', message);
      setFormError('Choisis une heure.');
      return;
    }

    const seatsCount = Number(places);
    if (!Number.isFinite(seatsCount) || seatsCount < 1) {
      const message = 'Remplis toutes les cases pour passer à la suite.';
      Alert.alert('Remplis toutes les cases avant de continuer', message);
      setFormError(message);
      return;
    }

    const priceValue = Number(price.replace(',', '.'));
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      const message = 'Indique le tarif par passager.';
      Alert.alert('Prix invalide', message);
      setFormError('Indique un prix par place valide.');
      return;
    }

    const hours = selectedTime.getHours();
    const minutes = selectedTime.getMinutes();
    const time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const rideId = `ride-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setIsPublishingRide(true);
    try {
      addRide({
        id: rideId,
        driver: session.name ?? 'Conducteur',
        plate: registeredPlate,
        depart: departure,
        destination: campus,
        time,
        seats: seatsCount,
        price: priceValue,
        ownerEmail: session.email,
        pricingMode: 'single',
      });
      Alert.alert('Trajet publié', 'Ton trajet est en ligne et peut être réservé.');
      router.back();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de publier ce trajet.';
      Alert.alert('Erreur', message);
      setFormError(message);
    } finally {
      setIsPublishingRide(false);
    }
  }, [
    campus,
    departure,
    isPublishingRide,
    price,
    registeredPlate,
    router,
    selectedDate,
    selectedTime,
    session,
  ]);

  const handleSeatsSelect = useCallback((value: number) => {
    setPlaces(String(value));
    setSeatsOpen(false);
  }, []);

  const handleDateChange = useCallback(
    (event: any, value?: Date) => {
      const isSet = event.type === 'set' || event.type === undefined;
      if (isSet && value) {
        setSelectedDate(value);
      }
      if (isSet || event.type === 'dismissed') {
        setDatePickerVisible(false);
      }
    },
    []
  );

  const handleTimeChange = useCallback(
    (event: any, value?: Date) => {
      const isSet = event.type === 'set' || event.type === undefined;
      if (isSet && value) {
        setSelectedTime(value);
      }
      if (isSet || event.type === 'dismissed') {
        setTimePickerVisible(false);
      }
    },
    []
  );

  return (
    <GradientBackground colors={['#FFF5EB', '#FFD3A1']} style={styles.screen}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          <View style={styles.formCard}>
            <Text style={styles.cardTitle}>Détails du trajet</Text>
            <View style={[styles.fieldBox, styles.fieldSpacing]}>
              <View style={styles.iconContainer}>
                <IconSymbol name="location.fill" size={18} color="#B7B7C6" />
              </View>
              <TextInput
                value={departure}
                onChangeText={setDeparture}
                placeholder="Point de départ"
                placeholderTextColor="#B7B7C6"
                style={styles.input}
              />
            </View>
            <View style={[styles.fieldBox, styles.fieldSpacing]}>
              <View style={styles.iconContainer}>
                <IconSymbol name="mappin.and.ellipse" size={18} color="#9F6BFF" />
              </View>
              <TextInput
                value={campus}
                onChangeText={setCampus}
                placeholder="Destination (Campus)"
                placeholderTextColor="#B7B7C6"
                style={styles.input}
              />
            </View>
            <View style={styles.row}>
              <Pressable
                style={[styles.dateField, styles.fieldBox]}
                onPress={() => setDatePickerVisible(true)}
              >
                <IconSymbol name="calendar" size={18} color="#B7B7C6" />
                <Text
                  style={[
                    styles.input,
                    !selectedDate && styles.placeholderText,
                  ]}
                >
                  {selectedDate ? formatDateLabel(selectedDate) : 'jj/mm/a'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.dateField, styles.fieldBox]}
                onPress={() => setTimePickerVisible(true)}
              >
                <IconSymbol name="clock" size={18} color="#B7B7C6" />
                <Text
                  style={[
                    styles.input,
                    !selectedTime && styles.placeholderText,
                  ]}
                >
                  {selectedTime ? formatTimeLabel(selectedTime) : '--:--'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.rowLabelRow}>
              <Text style={styles.fieldLabel}>Places disponibles</Text>
              <Text style={styles.fieldLabel}>Prix par place</Text>
            </View>
            <View style={styles.row}>
              <Pressable
                style={[styles.fieldBox, styles.dropdownField]}
                onPress={() => setSeatsOpen((prev) => !prev)}
              >
                <Text style={styles.dropdownText}>
                  {places ? `${places} place${Number(places) > 1 ? 's' : ''}` : '1 place'}
                </Text>
                <IconSymbol name="chevron.down" size={18} color="#B7B7C6" />
              </Pressable>
              <View style={[styles.fieldBox, styles.priceField]}>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  placeholder="0.00€"
                  placeholderTextColor="#B7B7C6"
                  style={styles.input}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            {seatsOpen && (
              <View style={styles.dropdownList}>
                {SEAT_OPTIONS.map((option) => (
                  <Pressable
                    key={option}
                    style={[
                      styles.dropdownItem,
                      Number(places) === option && styles.dropdownItemActive,
                    ]}
                    onPress={() => handleSeatsSelect(option)}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        Number(places) === option && styles.dropdownItemTextActive,
                      ]}
                    >
                      {option} place{option > 1 ? 's' : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Text style={styles.fieldLabel}>Informations supplémentaires</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Ex: Départ devant la bibliothèque..."
              placeholderTextColor="#B7B7C6"
              multiline
              style={styles.notesInput}
            />
            {formError ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            ) : null}
            <Pressable
              style={[
                styles.publishButton,
                isPublishingRide && styles.publishButtonDisabled,
              ]}
              onPress={handlePublish}
              disabled={isPublishingRide}
            >
              <View style={styles.publishButtonContent}>
                <IconSymbol name="paperplane.fill" size={18} color="#fff" />
                <Text style={styles.publishText}>
                  {isPublishingRide ? 'Publication…' : 'Publier le trajet'}
                </Text>
              </View>
            </Pressable>
          </View>

          <View style={styles.bottomNav}>
            {NAV_ITEMS.map((item) => (
              <Pressable key={item.key} style={styles.navItem} accessibilityRole="button">
                <IconSymbol
                  name={item.icon}
                  size={22}
                  color={item.active ? '#9F6BFF' : '#B7B7C6'}
                />
                <Text
                  style={[
                    styles.navLabel,
                    item.active && styles.navLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
                {item.active && <View style={styles.navIndicator} />}
              </Pressable>
            ))}
          </View>

          <>
            {datePickerVisible && (
              <Modal
                visible
                transparent
                animationType="fade"
                onRequestClose={() => setDatePickerVisible(false)}
              >
                <View style={styles.pickerBackdrop}>
                  <View style={styles.pickerCard}>
                    <Text style={styles.pickerTitle}>Choisir une date</Text>
                    <DateTimePicker
                      value={selectedDate ?? new Date()}
                      mode="date"
                      display="calendar"
                      onChange={handleDateChange}
                      minimumDate={new Date()}
                    />
                    <Pressable
                      style={styles.pickerAction}
                      onPress={() => setDatePickerVisible(false)}
                    >
                      <Text style={styles.pickerActionText}>Fermer</Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>
            )}
            {timePickerVisible && (
              <Modal
                visible
                transparent
                animationType="fade"
                onRequestClose={() => setTimePickerVisible(false)}
              >
                <View style={styles.pickerBackdrop}>
                  <View style={styles.pickerCard}>
                    <Text style={styles.pickerTitle}>Choisir une heure</Text>
                    <DateTimePicker
                      value={selectedTime ?? new Date()}
                      mode="time"
                      display="spinner"
                      onChange={handleTimeChange}
                      is24Hour
                    />
                    <Pressable
                      style={styles.pickerAction}
                      onPress={() => setTimePickerVisible(false)}
                    >
                      <Text style={styles.pickerActionText}>Fermer</Text>
                    </Pressable>
                  </View>
                </View>
              </Modal>
            )}
          </>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  formCard: {
    backgroundColor: Colors.white,
    borderRadius: 48,
    padding: Spacing.xl,
    gap: Spacing.md,
    ...Shadows.card,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ink,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: Radius['2xl'],
    padding: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  fieldSpacing: {
    marginTop: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.ink,
  },
  iconContainer: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  dateField: {
    flex: 1,
  },
  placeholderText: {
    color: Colors.gray500,
  },
  rowLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  fieldLabel: {
    color: Colors.gray500,
    fontSize: 12,
    fontWeight: '600',
  },
  dropdownField: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceField: {
    flex: 1,
  },
  dropdownText: {
    color: Colors.gray700,
    fontWeight: '700',
  },
  dropdownList: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    marginTop: Spacing.sm,
  },
  dropdownItem: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  dropdownItemActive: {
    backgroundColor: Colors.gray100,
  },
  dropdownItemText: {
    color: Colors.gray600,
    fontWeight: '600',
  },
  dropdownItemTextActive: {
    color: Colors.ink,
  },
  notesInput: {
    marginTop: Spacing.sm,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F1F1F4',
    backgroundColor: Colors.white,
    padding: Spacing.sm,
    minHeight: 120,
    textAlignVertical: 'top',
    color: Colors.ink,
  },
  errorBanner: {
    backgroundColor: Colors.dangerLight,
    borderRadius: Radius.xl,
    padding: Spacing.sm,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  errorText: {
    color: Colors.danger,
    fontWeight: '600',
  },
  publishButton: {
    marginTop: Spacing.lg,
    backgroundColor: '#9F6BFF',
    borderRadius: Radius['2xl'],
    paddingVertical: Spacing.md,
    alignItems: 'center',
    ...Shadows.card,
  },
  publishButtonDisabled: {
    backgroundColor: Colors.gray300,
  },
  publishButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  publishText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  bottomNav: {
    marginTop: Spacing.lg,
    backgroundColor: '#fff',
    borderRadius: 34,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-around',
    ...Shadows.card,
  },
  navItem: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  navLabel: {
    fontSize: 12,
    color: '#B7B7C6',
  },
  navLabelActive: {
    color: '#9F6BFF',
  },
  navIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9F6BFF',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerCard: {
    width: '90%',
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: Spacing.lg,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.ink,
    marginBottom: Spacing.md,
  },
  pickerAction: {
    alignSelf: 'flex-end',
    marginTop: Spacing.md,
  },
  pickerActionText: {
    color: Colors.accent,
    fontWeight: '600',
  },
});
