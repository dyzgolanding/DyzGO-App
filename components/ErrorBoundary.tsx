import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { COLORS } from '../constants/colors';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const fullError = `ERROR: ${this.state.error?.message}\n\nSTACK:\n${this.state.error?.stack}\n\nCOMPONENT STACK:\n${this.state.componentStack}`;
      return (
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.emoji}>⚡</Text>
          <Text style={styles.title}>Algo salió mal</Text>
          <Text style={styles.message}>{this.state.error?.message ?? 'Error inesperado'}</Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#333', marginBottom: 12 }]}
            onPress={() => {
              if (typeof navigator !== 'undefined' && navigator.clipboard) {
                navigator.clipboard.writeText(fullError);
              }
            }}
          >
            <Text style={styles.buttonText}>📋 Copiar error completo</Text>
          </TouchableOpacity>
          <Text style={styles.stack}>{fullError}</Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Reintentar</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    color: COLORS.textZinc,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: COLORS.neonPurple,
    height: 52,
    paddingHorizontal: 32,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  stack: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9,
    fontFamily: 'monospace',
    textAlign: 'left',
    marginBottom: 12,
    maxWidth: 380,
  },
});
