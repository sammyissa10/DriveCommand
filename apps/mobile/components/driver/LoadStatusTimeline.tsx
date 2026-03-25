import { View, Text, StyleSheet } from 'react-native'
import { Check } from 'lucide-react-native'

const STEPS = [
  { key: 'PENDING',    label: 'Pending' },
  { key: 'DISPATCHED', label: 'Dispatched' },
  { key: 'PICKED_UP',  label: 'Picked Up' },
  { key: 'IN_TRANSIT', label: 'In Transit' },
  { key: 'DELIVERED',  label: 'Delivered' },
] as const

type StepKey = typeof STEPS[number]['key']

function stepIndex(status: string): number {
  const idx = STEPS.findIndex((s) => s.key === status)
  // INVOICED/CANCELLED — treat as Delivered for display purposes
  return idx === -1 ? STEPS.length - 1 : idx
}

interface LoadStatusTimelineProps {
  status: string
}

export function LoadStatusTimeline({ status }: LoadStatusTimelineProps) {
  const current = stepIndex(status)

  return (
    <View style={styles.wrapper}>
      <Text style={styles.sectionLabel}>STATUS TIMELINE</Text>
      <View style={styles.row}>
        {STEPS.map((step, i) => {
          const done    = i < current
          const active  = i === current
          const future  = i > current
          const isLast  = i === STEPS.length - 1

          return (
            <View key={step.key} style={styles.stepWrapper}>
              {/* Node */}
              <View style={[
                styles.node,
                done   && styles.nodeDone,
                active && styles.nodeActive,
                future && styles.nodeFuture,
              ]}>
                {done ? (
                  <Check color="#fff" size={12} strokeWidth={3} />
                ) : (
                  <Text style={[
                    styles.nodeNum,
                    active && styles.nodeNumActive,
                    future && styles.nodeNumFuture,
                  ]}>
                    {i + 1}
                  </Text>
                )}
              </View>

              {/* Label */}
              <Text
                style={[
                  styles.label,
                  done   && styles.labelDone,
                  active && styles.labelActive,
                  future && styles.labelFuture,
                ]}
                numberOfLines={1}
              >
                {step.label}
              </Text>

              {/* Connector line — rendered to the right of each step except last */}
              {!isLast && (
                <View style={[
                  styles.line,
                  (done || active) ? styles.lineDone : styles.lineFuture,
                ]} />
              )}
            </View>
          )
        })}
      </View>
    </View>
  )
}

const NODE_SIZE = 28
const LINE_HEIGHT = 2

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepWrapper: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  // Connector line sits in the middle of the row, between nodes
  line: {
    position: 'absolute',
    top: NODE_SIZE / 2 - LINE_HEIGHT / 2,
    left: '50%',
    right: '-50%',
    height: LINE_HEIGHT,
    zIndex: 0,
  },
  lineDone: {
    backgroundColor: '#22c55e',
  },
  lineFuture: {
    backgroundColor: '#334155',
  },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    marginBottom: 6,
  },
  nodeDone: {
    backgroundColor: '#22c55e',
  },
  nodeActive: {
    backgroundColor: '#2563eb',
    borderWidth: 2,
    borderColor: '#60a5fa',
  },
  nodeFuture: {
    backgroundColor: '#1e293b',
    borderWidth: 1.5,
    borderColor: '#475569',
  },
  nodeNum: {
    fontSize: 11,
    fontWeight: '700',
  },
  nodeNumActive: {
    color: '#ffffff',
  },
  nodeNumFuture: {
    color: '#64748b',
  },
  label: {
    fontSize: 10,
    textAlign: 'center',
  },
  labelDone: {
    color: '#22c55e',
    fontWeight: '600',
  },
  labelActive: {
    color: '#60a5fa',
    fontWeight: '700',
  },
  labelFuture: {
    color: '#475569',
    fontWeight: '500',
  },
})
