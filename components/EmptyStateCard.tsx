import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { COLORS } from '../constants/colors';
import { PressableScale } from './animated/PressableScale';

const { width } = Dimensions.get('window');
const isSmallScreen = width <= 380;

interface EmptyStateCardProps {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    actionText?: string;
    onAction?: () => void;
    height?: number; // Optional height override for FlatList Snapping
    marginTop?: number; // Optional positioning
}

export function EmptyStateCard({ 
    icon, title, subtitle, actionText, onAction, height, marginTop = 0 
}: EmptyStateCardProps) {
    return (
        <View style={[{ flex: 1, justifyContent: 'center', paddingHorizontal: 20, marginTop }, height ? { height } : undefined]}>
            <View style={styles.card}>
                <View style={styles.iconWrapper}>
                    {icon}
                </View>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
                {actionText && onAction && (
                    <PressableScale 
                        scaleTo={0.94} 
                        haptic="medium" 
                        style={styles.button}
                        onPress={onAction}
                        activeOpacity={0.9}
                    >
                        <Text style={styles.buttonText}>{actionText}</Text>
                    </PressableScale>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 32,
        padding: 30,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center'
    },
    iconWrapper: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: 'rgba(255,49,216,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(255,49,216,0.35)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20
    },
    title: {
        color: '#FBFBFB',
        fontSize: 24,
        fontWeight: '900',
        fontStyle: 'italic',
        textAlign: 'center',
        marginBottom: 12,
        letterSpacing: -1
    },
    subtitle: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 30,
        paddingHorizontal: 10
    },
    button: {
        backgroundColor: 'rgba(255,49,216,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(255,49,216,0.35)',
        height: 50,
        borderRadius: 16,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center'
    },
    buttonText: {
        color: COLORS.neonPink,
        fontWeight: '900',
        fontSize: 14,
        letterSpacing: 0.5
    }
});
