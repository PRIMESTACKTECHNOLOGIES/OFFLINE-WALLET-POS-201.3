import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';

/// Network utility for monitoring connectivity
class NetworkUtil {
  static final NetworkUtil _instance = NetworkUtil._internal();
  factory NetworkUtil() => _instance;
  NetworkUtil._internal();

  final Connectivity _connectivity = Connectivity();
  StreamSubscription<ConnectivityResult>? _subscription;
  final _controller = StreamController<bool>.broadcast();
  bool _isOnline = false;

  /// Stream of connectivity changes
  Stream<bool> get onConnectivityChanged => _controller.stream;

  /// Current connectivity status
  bool get isOnline => _isOnline;

  /// Initialize network monitoring
  void initialize() {
    _subscription = _connectivity.onConnectivityChanged.listen((result) {
      _isOnline = result != ConnectivityResult.none;
      _controller.add(_isOnline);
    });
    
    // Check initial status
    checkConnectivity();
  }

  /// Check current connectivity
  Future<bool> checkConnectivity() async {
    final result = await _connectivity.checkConnectivity();
    _isOnline = result != ConnectivityResult.none;
    return _isOnline;
  }

  /// Dispose resources
  void dispose() {
    _subscription?.cancel();
    _controller.close();
  }

  /// Check if connected to WiFi
  Future<bool> isWifi() async {
    final result = await _connectivity.checkConnectivity();
    return result == ConnectivityResult.wifi;
  }

  /// Check if connected to mobile data
  Future<bool> isMobile() async {
    final result = await _connectivity.checkConnectivity();
    return result == ConnectivityResult.mobile;
  }
}

/// Network-aware operation wrapper
class NetworkOperation<T> {
  final Future<T> Function() online;
  final Future<T> Function()? offline;

  NetworkOperation({
    required this.online,
    this.offline,
  });

  Future<T> execute() async {
    final isOnline = await NetworkUtil().checkConnectivity();
    
    if (isOnline) {
      return await online();
    } else if (offline != null) {
      return await offline!();
    } else {
      throw NetworkException('No internet connection');
    }
  }
}

/// Network exception
class NetworkException implements Exception {
  final String message;
  NetworkException(this.message);

  @override
  String toString() => 'NetworkException: $message';
}
