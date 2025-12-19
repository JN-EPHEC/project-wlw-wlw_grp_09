import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useRouter } from 'expo-router';

import { GradientBackground } from '@/components/ui/gradient-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Radius, Spacing, Shadows } from '@/app/ui/theme';
import { FALLBACK_UPCOMING } from '@/app/data/driver-samples';

const DRIVER_RULES = [
  { key: 'no-smoking', label: 'Fumée non autorisée', icon: '🚭' },
  { key: 'music', label: 'Musique autorisée', icon: '🎵' },
  { key: 'pets', label: 'Animaux acceptés', icon: '🐕' },
  { key: 'calm', label: 'Trajet calme', icon: '🤫' },
  { key: 'luggage', label: 'Bagages acceptés', icon: '🧳' },
  { key: 'chat', label: 'Discussion bienvenue', icon: '💬' },
];

const CAMPUS_OPTIONS = [
  'EPHEC Delta',
  'EPHEC Louvain-la-Neuve',
  'EPHEC Schaerbeek',
  'EPHEC Woluwe',
];

const MAP_NODES = [
  { name: 'EPHEC Woluwe', icon: 'school', color: '#8F7FFE', left: '58%', top: '18%' },
  { name: 'EPHEC Delta', icon: 'school', color: '#FFB26C', left: '18%', top: '60%' },
  { name: 'EPHEC Louvain-la-Neuve', icon: 'school', color: '#FF865F', left: '55%', top: '40%' },
  { name: 'EPHEC Schaerbeek', icon: 'school', color: '#7ED0FF', left: '30%', top: '30%' },
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
  const initialRide = FALLBACK_UPCOMING[0];
  const initialDate = initialRide ? new Date(initialRide.departureAt) : null;
  const initialTime = initialRide ? new Date(initialRide.departureAt) : null;
  const [departure, setDeparture] = useState(initialRide?.depart ?? '');
  const [campus, setCampus] = useState(initialRide?.destination ?? CAMPUS_OPTIONS[0]);
  const [campusOpen, setCampusOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate);
  const [selectedTime, setSelectedTime] = useState<Date | null>(initialTime);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [places, setPlaces] = useState(initialRide ? String(initialRide.seats) : '3');
  const [seatsOpen, setSeatsOpen] = useState(false);
  const [price, setPrice] = useState(initialRide ? initialRide.price.toFixed(2) : '');
  const [notes, setNotes] = useState('');
  const [rules, setRules] = useState(() =>
    DRIVER_RULES.reduce<Record<string, boolean>>((acc, rule) => {
      acc[rule.key] = false;
      return acc;
    }, {})
  );

  const selectedCount = useMemo(
    () => Object.values(rules).filter((value) => value).length,
    [rules]
  );

  const toggleRule = useCallback((key: string) => {
    setRules((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handlePublish = useCallback(() => {
    const summary = [
      departure && `Départ : ${departure.trim()}`,
      campus && `Campus : ${campus}`,
      selectedDate && `Date : ${formatDateLabel(selectedDate)}`,
      selectedTime && `Heure : ${formatTimeLabel(selectedTime)}`,
      `Places : ${places || '3'}`,
      price && `Prix : ${price}€`,
      selectedCount ? `Règles : ${selectedCount}` : 'Règles : non définies',
    ]
      .filter(Boolean)
      .join('\n');

    Alert.alert('Trajet publié', summary || 'Trajet prêt à être partagé.');
    router.back();
  }, [
    departure,
    campus,
    selectedDate,
    selectedTime,
    places,
    price,
    selectedCount,
    router,
  ]);

  const handleCampusSelect = useCallback((value: string) => {
    setCampus(value);
    setCampusOpen(false);
  }, []);

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
    <GradientBackground colors={['#FF9052', '#FFAA6C']} style={styles.screen}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <IconSymbol name="chevron.left" size={24} color="#fff" />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={styles.heroTitle}>Créer un trajet</Text>
            <Text style={styles.heroSubtitle}>Proposez un covoiturage aux étudiants</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.form}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          <View style={styles.mapPreview}>
            <View style={styles.mapGrid}>
              {[20, 40, 60, 80].map((value) => (
                <View
                  key={`v-${value}`}
                  style={[styles.mapLine, { left: `${value}%`, height: '100%' }]}
                />
              ))}
              {[20, 40, 60, 80].map((value) => (
                <View
                  key={`h-${value}`}
                  style={[styles.mapLine, { top: `${value}%`, width: '100%' }]}
                />
              ))}
            </View>
            {MAP_NODES.map((node) => (
              <View
                key={node.name}
                style={[
                  styles.mapNode,
                  { backgroundColor: node.color, left: node.left, top: node.top },
                ]}
              >
                <IconSymbol name={node.icon} size={20} color="#fff" />
                <Text style={styles.mapNodeLabel}>{node.name}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Itinéraire</Text>
            <View style={styles.labelRow}>
              <IconSymbol name="location.fill" size={16} color={Colors.gray500} />
              <Text style={styles.labelText}>Point de départ</Text>
            </View>
            <View style={styles.inputField}>
              <TextInput
                value={departure}
                onChangeText={setDeparture}
                placeholder="Adresse de départ"
                placeholderTextColor={Colors.gray400}
                style={styles.input}
              />
            </View>
            <View style={styles.swapButton}>
              <IconSymbol name="arrow.up.arrow.down" size={20} color={Colors.gray600} />
            </View>
            <View style={styles.labelRow}>
              <IconSymbol name="graduationcap.fill" size={16} color={Colors.accent} />
              <Text style={styles.labelText}>Destination campus</Text>
            </View>
            <Pressable
              style={styles.dropdown}
              onPress={() => setCampusOpen((prev) => !prev)}
            >
              <Text
                style={[
                  styles.dropdownText,
                  campus ? styles.dropdownTextActive : null,
                ]}
              >
                {campus || 'Sélectionnez un campus'}
              </Text>
              <IconSymbol name="chevron.down" size={16} color={Colors.gray500} />
            </Pressable>
            {campusOpen && (
              <View style={styles.dropdownList}>
                {CAMPUS_OPTIONS.map((option) => (
                  <Pressable
                    key={option}
                    style={[
                      styles.dropdownItem,
                      campus === option && styles.dropdownItemActive,
                    ]}
                    onPress={() => handleCampusSelect(option)}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        campus === option && styles.dropdownItemTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Détails du trajet</Text>
            <View style={styles.fieldRow}>
              <View style={styles.fieldBubble}>
                <Text style={styles.fieldLabel}>Point de départ</Text>
                <View style={styles.fieldInputRow}>
                  <IconSymbol name="location.fill" size={18} color="#A0A5B9" />
                  <TextInput
                    value={departure}
                    onChangeText={setDeparture}
                    placeholder="Adresse de départ"
                    placeholderTextColor="#A0A5B9"
                    style={styles.detailInput}
                  />
                </View>
              </View>
              <View style={styles.fieldBubble}>
                <Text style={styles.fieldLabel}>Destination (Campus)</Text>
                <View style={styles.fieldInputRow}>
                  <IconSymbol name="mappin.and.ellipse" size={18} color="#8F7FFE" />
                  <TextInput
                    value={campus}
                    onChangeText={setCampus}
                    placeholder="Campus ou adresse"
                    placeholderTextColor="#A0A5B9"
                    style={styles.detailInput}
                  />
                </View>
              </View>
            </View>
            <View style={styles.fieldRow}>
              <Pressable
                style={styles.fieldBubble}
                onPress={() => setDatePickerVisible(true)}
                hitSlop={16}
              >
                <View style={styles.fieldLabelRow}>
                  <IconSymbol name="calendar" size={18} color="#A0A5B9" />
                  <Text style={styles.fieldLabel}>Date</Text>
                </View>
                <Text style={styles.fieldPlaceholder}>{formatDateLabel(selectedDate)}</Text>
                <Text style={styles.fieldHint}>Appuie pour choisir une date</Text>
              </Pressable>
              <Pressable
                style={styles.fieldBubble}
                onPress={() => setTimePickerVisible(true)}
                hitSlop={16}
              >
                <View style={styles.fieldLabelRow}>
                  <IconSymbol name="clock" size={18} color="#A0A5B9" />
                  <Text style={styles.fieldLabel}>Heure</Text>
                </View>
                <Text style={styles.fieldPlaceholder}>{formatTimeLabel(selectedTime)}</Text>
                <Text style={styles.fieldHint}>Appuie pour choisir une heure</Text>
              </Pressable>
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.fieldBubble}>
                <Text style={styles.fieldLabel}>Places disponibles</Text>
                <Pressable style={styles.dropdownField} onPress={() => setSeatsOpen((prev) => !prev)}>
                  <Text style={styles.fieldPlaceholder}>
                    {(places ? `${places} place${Number(places) > 1 ? 's' : ''}` : '3 places')}
                  </Text>
                  <IconSymbol name="chevron.down" size={18} color="#A0A5B9" />
                </Pressable>
              </View>
              <View style={styles.fieldBubble}>
                <Text style={styles.fieldLabel}>Prix par place</Text>
                <TextInput
                  value={price}
                  onChangeText={(value) => setPrice(value)}
                  placeholder="0,00"
                  placeholderTextColor="#A0A5B9"
                  style={styles.detailInput}
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
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Informations supplémentaires"
              placeholderTextColor="#A0A5B9"
              multiline
              style={[styles.input, styles.textArea]}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Règles du trajet</Text>
            <Text style={styles.cardSubtitle}>Sélectionnez les règles à appliquer pendant le trajet</Text>
            <View style={styles.rulesGrid}>
              {DRIVER_RULES.map((rule) => (
                <Pressable
                  key={rule.key}
                  style={[
                    styles.ruleChip,
                    rules[rule.key] && styles.ruleChipActive,
                  ]}
                  onPress={() => toggleRule(rule.key)}
                >
                  <Text style={styles.ruleIcon}>{rule.icon}</Text>
                  <Text
                    style={[
                      styles.ruleText,
                      rules[rule.key] && styles.ruleTextActive,
                    ]}
                  >
                    {rule.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable style={styles.publishButton} onPress={handlePublish}>
            <Text style={styles.publishText}>Publier le trajet</Text>
          </Pressable>
          {Platform.OS === 'ios' ? (
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
                        display="spinner"
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
          ) : (
            <>
              {datePickerVisible && (
                <DateTimePicker
                  value={selectedDate ?? new Date()}
                  mode="date"
                  display="calendar"
                  onChange={handleDateChange}
                  minimumDate={new Date()}
                />
              )}
              {timePickerVisible && (
                <DateTimePicker
                  value={selectedTime ?? new Date()}
                  mode="time"
                  display="clock"
                  onChange={handleTimeChange}
                  is24Hour
                />
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  titleBlock: {
    flex: 1,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: '#fff',
    fontSize: 16,
    marginTop: Spacing.xs,
  },
  form: {
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  mapPreview: {
    backgroundColor: '#FDEED8',
    borderRadius: 30,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    minHeight: 180,
    justifyContent: 'center',
    position: 'relative',
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapLine: {
    position: 'absolute',
    borderColor: '#FFE1BC',
    borderWidth: 1,
    opacity: 0.8,
  },
  mapNode: {
    position: 'absolute',
    padding: Spacing.sm,
    gap: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    minWidth: 80,
  },
  mapNodeLabel: {
    marginTop: Spacing.xs,
    backgroundColor: '#fff',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    fontSize: 12,
    fontWeight: '600',
  },
  fieldRow: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  fieldInput: {
    backgroundColor: '#F7F7FB',
    borderRadius: 22,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  fieldPlaceholder: {
    color: '#A0A5B9',
    fontWeight: '600',
  },
  fieldBubble: {
    backgroundColor: '#F7F7FB',
    borderRadius: 18,
    padding: Spacing.sm,
    flex: 1,
    gap: Spacing.xs,
  },
  fieldInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    paddingBottom: Spacing.xs,
  },
  fieldLabel: {
    color: '#A0A5B9',
    fontSize: 12,
    fontWeight: '600',
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs / 2,
  },
  fieldHint: {
    color: Colors.gray500,
    fontSize: 12,
    marginTop: Spacing.xs / 2,
  },
  dropdownField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 36,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  cardSubtitle: {
    color: Colors.gray500,
    fontSize: 13,
    marginBottom: Spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  labelText: {
    color: Colors.gray700,
    fontWeight: '600',
  },
  inputField: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 24,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray50,
  },
  input: {
    fontSize: 16,
    color: Colors.ink,
    padding: 0,
  },
  swapButton: {
    alignSelf: 'center',
    marginTop: Spacing.sm,
    backgroundColor: Colors.gray50,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 24,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    backgroundColor: Colors.gray50,
  },
  dropdownText: {
    color: Colors.gray600,
    fontWeight: '600',
  },
  dropdownTextActive: {
    color: Colors.ink,
  },
  dropdownList: {
    marginTop: Spacing.sm,
    borderRadius: 18,
    backgroundColor: Colors.gray50,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  dropdownItem: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  dropdownItemActive: {
    backgroundColor: Colors.gray100,
  },
  dropdownItemText: {
    color: Colors.gray700,
    fontWeight: '600',
  },
  dropdownItemTextActive: {
    color: Colors.ink,
  },
  detailRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  detailColumn: {
    flex: 1,
    gap: Spacing.xs,
  },
  detailLabel: {
    color: Colors.gray500,
    fontSize: 12,
  },
  detailBubbleText: {
    color: Colors.gray600,
    fontWeight: '600',
    flex: 1,
  },
  detailBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 18,
    padding: Spacing.sm,
    backgroundColor: Colors.gray50,
  },
  detailInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.ink,
    padding: 0,
  },
  textArea: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 18,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
    textAlignVertical: 'top',
    backgroundColor: Colors.gray50,
  },
  rulesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  ruleChip: {
    flexBasis: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: 18,
    backgroundColor: Colors.gray50,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  ruleChipActive: {
    backgroundColor: '#F2EBFF',
    borderColor: Colors.accent,
  },
  ruleIcon: {
    fontSize: 18,
  },
  ruleText: {
    color: Colors.gray700,
    fontWeight: '600',
    flex: 1,
  },
  ruleTextActive: {
    color: Colors.accent,
  },
  publishButton: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.accent,
    borderRadius: Radius['2xl'],
    paddingVertical: Spacing.md,
    alignItems: 'center',
    ...Shadows.card,
  },
  publishText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
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
