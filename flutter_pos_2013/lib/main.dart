import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'core/theme/app_theme.dart';
import 'data/repository/merchant_repository.dart';
import 'presentation/bloc/auth_bloc.dart';
import 'presentation/bloc/pos_bloc.dart';
import 'presentation/screens/main_pos_screen.dart';
import 'presentation/screens/merchant_switcher_screen.dart';
import 'presentation/screens/receipt_screen.dart';
import 'presentation/screens/reports_screen.dart';
import 'presentation/screens/setup_screen.dart';
import 'presentation/screens/splash_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize merchant repository
  await MerchantRepository.initialize();
  
  // Set preferred orientations
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  
  // Set system UI overlay style
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );
  
  runApp(const PosApp());
}

/// App Router
final _router = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const SplashScreen(),
    ),
    GoRoute(
      path: '/setup',
      builder: (context, state) => const SetupScreen(),
    ),
    GoRoute(
      path: '/main',
      builder: (context, state) => const MainPosScreen(),
    ),
    GoRoute(
      path: '/receipt',
      builder: (context, state) {
        final extra = state.extra as Map<String, dynamic>;
        return ReceiptScreen(
          amount: extra['amount'] as double,
          stan: extra['stan'] as String,
          txnId: extra['txnId'] as String,
          settlementCode: extra['settlementCode'] as String?,
          status: extra['status'] as String,
          isOffline: extra['isOffline'] as bool,
        );
      },
    ),
    GoRoute(
      path: '/reports',
      builder: (context, state) => const ReportsScreen(),
    ),
    GoRoute(
      path: '/merchants',
      builder: (context, state) => const MerchantSwitcherScreen(),
    ),
  ],
);

/// Main App Widget
class PosApp extends StatelessWidget {
  const PosApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(create: (_) => AuthBloc()),
        BlocProvider(create: (_) => PosBloc()),
      ],
      child: MaterialApp.router(
        title: 'POS-201.3',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.lightTheme,
        darkTheme: AppTheme.darkTheme,
        themeMode: ThemeMode.system,
        routerConfig: _router,
      ),
    );
  }
}
