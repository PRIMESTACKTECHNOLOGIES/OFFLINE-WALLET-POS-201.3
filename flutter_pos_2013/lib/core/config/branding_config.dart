import 'package:flutter/material.dart';

/// Branding Configuration
/// Customize these values to match your brand
class BrandingConfig {
  // App Info
  static const String appName = 'POS-201.3';
  static const String companyName = 'Your Company';
  static const String appVersion = '2.0.0';
  static const String supportEmail = 'support@yourcompany.com';
  static const String website = 'https://yourcompany.com';
  
  // Primary Colors
  static const Color primaryColor = Color(0xFF1E88E5);
  static const Color primaryDarkColor = Color(0xFF1565C0);
  static const Color primaryLightColor = Color(0xFF64B5F6);
  
  // Accent Colors
  static const Color accentColor = Color(0xFF00C853);
  static const Color warningColor = Color(0xFFFFB300);
  static const Color errorColor = Color(0xFFE53935);
  
  // Background Colors
  static const Color backgroundColor = Color(0xFFF5F5F5);
  static const Color darkBackgroundColor = Color(0xFF121212);
  
  // Logo Paths
  static const String logoLight = 'assets/images/logo_light.png';
  static const String logoDark = 'assets/images/logo_dark.png';
  static const String logoSplash = 'assets/images/logo_splash.png';
  static const String icon = 'assets/images/icon.png';
  
  // Receipt Header
  static const String receiptHeader = 'Your Company Name';
  static const String receiptAddress = '123 Business Street, City, Country';
  static const String receiptPhone = '+1 234 567 8900';
  static const String receiptFooter = 'Thank you for your business!';
  
  // Currency
  static const String defaultCurrency = 'USD';
  static const String currencySymbol = '\$';
  
  // Features
  static const bool enableAnalytics = true;
  static const bool enableMultiMerchant = true;
  static const bool enableReports = true;
  static const bool enableBiometric = true;
}
