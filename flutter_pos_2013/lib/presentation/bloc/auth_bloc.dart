import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../../core/config/gateway_config.dart';
import '../../data/model/auth_model.dart';
import '../../data/remote/api_service.dart';

// Events
abstract class AuthEvent extends Equatable {
  const AuthEvent();

  @override
  List<Object?> get props => [];
}

class CheckAuthStatus extends AuthEvent {}

class Login extends AuthEvent {
  final String merchantId;
  final String terminalId;
  final String secretKey;
  final String serverUrl;

  const Login({
    required this.merchantId,
    required this.terminalId,
    required this.secretKey,
    required this.serverUrl,
  });

  @override
  List<Object?> get props => [merchantId, terminalId, secretKey, serverUrl];
}

class Logout extends AuthEvent {}

class UpdateMyFatoorahConfig extends AuthEvent {
  final String token;
  final bool testMode;

  const UpdateMyFatoorahConfig({
    required this.token,
    this.testMode = true,
  });

  @override
  List<Object?> get props => [token, testMode];
}

// States
abstract class AuthState extends Equatable {
  const AuthState();

  @override
  List<Object?> get props => [];
}

class AuthInitial extends AuthState {}

class AuthLoading extends AuthState {}

class Authenticated extends AuthState {
  final TerminalInfo terminalInfo;
  final bool isMyFatoorahConfigured;

  const Authenticated({
    required this.terminalInfo,
    this.isMyFatoorahConfigured = false,
  });

  Authenticated copyWith({
    TerminalInfo? terminalInfo,
    bool? isMyFatoorahConfigured,
  }) {
    return Authenticated(
      terminalInfo: terminalInfo ?? this.terminalInfo,
      isMyFatoorahConfigured: isMyFatoorahConfigured ?? this.isMyFatoorahConfigured,
    );
  }

  @override
  List<Object?> get props => [terminalInfo, isMyFatoorahConfigured];
}

class Unauthenticated extends AuthState {}

class SetupRequired extends AuthState {}

class AuthError extends AuthState {
  final String message;

  const AuthError(this.message);

  @override
  List<Object?> get props => [message];
}

class MyFatoorahConfigUpdated extends AuthState {
  final bool success;

  const MyFatoorahConfigUpdated(this.success);

  @override
  List<Object?> get props => [success];
}

// BLoC
class AuthBloc extends Bloc<AuthEvent, AuthState> {
  final ApiService _apiService;

  AuthBloc({ApiService? apiService})
      : _apiService = apiService ?? ApiService(),
        super(AuthInitial()) {
    on<CheckAuthStatus>(_onCheckAuthStatus);
    on<Login>(_onLogin);
    on<Logout>(_onLogout);
    on<UpdateMyFatoorahConfig>(_onUpdateMyFatoorahConfig);
  }

  Future<void> _onCheckAuthStatus(
    CheckAuthStatus event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());
    try {
      final isRegistered = await GatewayConfig.isDeviceRegistered;
      
      if (!isRegistered) {
        emit(SetupRequired());
        return;
      }

      final merchantId = await GatewayConfig.merchantId;
      final terminalId = await GatewayConfig.terminalId;
      final serverUrl = await GatewayConfig.serverUrl;
      final isMyFatoorahConfigured = await GatewayConfig.isMyFatoorahConfigured;

      emit(Authenticated(
        terminalInfo: TerminalInfo(
          merchantId: merchantId,
          terminalId: terminalId,
          serverUrl: serverUrl,
          isRegistered: true,
        ),
        isMyFatoorahConfigured: isMyFatoorahConfigured,
      ));
    } catch (e) {
      emit(AuthError('Failed to check auth status: $e'));
    }
  }

  Future<void> _onLogin(
    Login event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());
    try {
      // First save the config temporarily
      await GatewayConfig.setServerUrl(event.serverUrl);

      // Verify credentials with server
      final request = VerifyRequest(
        merchantId: event.merchantId,
        terminalId: event.terminalId,
        secretKey: event.secretKey,
      );

      final response = await _apiService.verifyCredentials(request);

      if (response.valid) {
        // Save the registration
        await GatewayConfig.registerDevice(
          merchantId: event.merchantId,
          terminalId: event.terminalId,
          secretKey: event.secretKey,
          serverUrl: event.serverUrl,
        );

        final isMyFatoorahConfigured = await GatewayConfig.isMyFatoorahConfigured;

        emit(Authenticated(
          terminalInfo: TerminalInfo(
            merchantId: event.merchantId,
            terminalId: event.terminalId,
            serverUrl: event.serverUrl,
            isRegistered: true,
            registeredAt: DateTime.now(),
          ),
          isMyFatoorahConfigured: isMyFatoorahConfigured,
        ));
      } else {
        emit(AuthError(response.message ?? 'Invalid credentials'));
      }
    } catch (e) {
      emit(AuthError('Login failed: $e'));
    }
  }

  Future<void> _onLogout(
    Logout event,
    Emitter<AuthState> emit,
  ) async {
    emit(AuthLoading());
    try {
      await GatewayConfig.unregisterDevice();
      emit(Unauthenticated());
    } catch (e) {
      emit(AuthError('Logout failed: $e'));
    }
  }

  Future<void> _onUpdateMyFatoorahConfig(
    UpdateMyFatoorahConfig event,
    Emitter<AuthState> emit,
  ) async {
    try {
      await GatewayConfig.setMyFatoorahToken(event.token);
      await GatewayConfig.setMyFatoorahTestMode(event.testMode);
      
      emit(const MyFatoorahConfigUpdated(true));
      
      // Refresh authenticated state
      final currentState = state;
      if (currentState is Authenticated) {
        emit(currentState.copyWith(isMyFatoorahConfigured: true));
      }
    } catch (e) {
      emit(const MyFatoorahConfigUpdated(false));
    }
  }
}
