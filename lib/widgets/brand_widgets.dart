import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class BrandBackdrop extends StatelessWidget {
  final Widget child;
  const BrandBackdrop({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.surfaceColor,
        gradient: LinearGradient(
          colors: [Color(0xFFFFFFFF), Color(0xFFFBFBFD)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            top: -80,
            left: -40,
            child: _GlowOrb(
              color: AppTheme.primaryTeal.withValues(alpha: 0.12),
              size: 220,
            ),
          ),
          Positioned(
            top: -40,
            right: -30,
            child: _GlowOrb(
              color: AppTheme.accentColor.withValues(alpha: 0.12),
              size: 180,
            ),
          ),
          Positioned(
            bottom: -60,
            right: -10,
            child: _GlowOrb(
              color: AppTheme.coralColor.withValues(alpha: 0.08),
              size: 220,
            ),
          ),
          child,
        ],
      ),
    );
  }
}

class BrandLogo extends StatelessWidget {
  final double width;
  final double height;
  final BoxFit fit;
  const BrandLogo({
    super.key,
    this.width = 168,
    this.height = 54,
    this.fit = BoxFit.contain,
  });

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/branding/coparentes-logo.png',
      width: width,
      height: height,
      fit: fit,
      errorBuilder: (_, __, ___) => const Text(
        'Coparentes',
        style: TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w800,
          color: AppTheme.textPrimary,
          letterSpacing: -1,
        ),
      ),
    );
  }
}

class BrandCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;
  const BrandCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(24),
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusLg),
        border: Border.all(color: AppTheme.dividerColor),
        boxShadow: AppTheme.softShadow,
      ),
      child: child,
    );
  }
}

class BrandGradientPill extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  const BrandGradientPill({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
  });

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: AppTheme.brandGradient,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}

class _GlowOrb extends StatelessWidget {
  final Color color;
  final double size;
  const _GlowOrb({required this.color, required this.size});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [color, color.withValues(alpha: 0)],
          ),
        ),
      ),
    );
  }
}
