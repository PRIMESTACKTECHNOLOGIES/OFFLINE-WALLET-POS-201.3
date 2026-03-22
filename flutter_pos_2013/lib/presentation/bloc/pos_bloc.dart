import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:equatable/equatable.dart';
import '../../core/result/result.dart';
import '../../data/model/transaction_model.dart';
import '../../data/repository/payment_repository.dart';
import '../../data/repository/myfatoorah_repository.dart';

// Events
abstract class PosEvent extends Equatable {
  const PosEvent();

  @override
  List<Object?> get props => [];
}

class InitializePos extends PosEvent {}

class ProcessPayment extends PosEvent {
  final String cardNumber;
  final String expiry;
  final String? cvv;
  final double amount;

  const ProcessPayment({
    required this.cardNumber,
    required this.expiry,
    this.cvv,
    required this.amount,
  });

  @override
  List<Object?> get props => [cardNumber, expiry, cvv, amount];
}

class SyncTransactions extends PosEvent {}

class RedeemCode extends PosEvent {
  final String code;
  final double amount;

  const RedeemCode({required this.code, required this.amount});

  @override
  List<Object?> get props => [code, amount];
}

class RefreshPendingCount extends PosEvent {}

class CreateMyFatoorahPayment extends PosEvent {
  final double amount;
  final String customerName;
  final String? customerMobile;

  const CreateMyFatoorahPayment({
    required this.amount,
    required this.customerName,
    this.customerMobile,
  });

  @override
  List<Object?> get props => [amount, customerName, customerMobile];
}

class CreateOfflineOrder extends PosEvent {
  final double amount;
  final String customerName;
  final String customerPhone;

  const CreateOfflineOrder({
    required this.amount,
    required this.customerName,
    required this.customerPhone,
  });

  @override
  List<Object?> get props => [amount, customerName, customerPhone];
}

class ProcessOfflineOrders extends PosEvent {}

class CheckOfflinePayments extends PosEvent {}

// States
abstract class PosState extends Equatable {
  const PosState();

  @override
  List<Object?> get props => [];
}

class PosInitial extends PosState {}

class PosLoading extends PosState {}

class PosLoaded extends PosState {
  final int pendingCount;
  final int offlineOrderCount;
  final bool isOnline;

  const PosLoaded({
    this.pendingCount = 0,
    this.offlineOrderCount = 0,
    this.isOnline = false,
  });

  PosLoaded copyWith({
    int? pendingCount,
    int? offlineOrderCount,
    bool? isOnline,
  }) {
    return PosLoaded(
      pendingCount: pendingCount ?? this.pendingCount,
      offlineOrderCount: offlineOrderCount ?? this.offlineOrderCount,
      isOnline: isOnline ?? this.isOnline,
    );
  }

  @override
  List<Object?> get props => [pendingCount, offlineOrderCount, isOnline];
}

class PaymentProcessing extends PosState {}

class PaymentCompleted extends PosState {
  final PaymentResult result;

  const PaymentCompleted(this.result);

  @override
  List<Object?> get props => [result];
}

class SyncInProgress extends PosState {}

class SyncCompleted extends PosState {
  final SyncSummary summary;

  const SyncCompleted(this.summary);

  @override
  List<Object?> get props => [summary];
}

class RedeemCompleted extends PosState {
  final RedeemResult result;

  const RedeemCompleted(this.result);

  @override
  List<Object?> get props => [result];
}

class MyFatoorahPaymentCreated extends PosState {
  final MyFatoorahResult result;

  const MyFatoorahPaymentCreated(this.result);

  @override
  List<Object?> get props => [result];
}

class OfflineOrderCreated extends PosState {
  final OfflineOrder order;

  const OfflineOrderCreated(this.order);

  @override
  List<Object?> get props => [order];
}

class OfflineOrdersProcessed extends PosState {
  final List<OfflineOrder> orders;

  const OfflineOrdersProcessed(this.orders);

  @override
  List<Object?> get props => [orders];
}

class OfflinePaymentsChecked extends PosState {
  final List<OfflineOrder> paidOrders;

  const OfflinePaymentsChecked(this.paidOrders);

  @override
  List<Object?> get props => [paidOrders];
}

class PosError extends PosState {
  final String message;

  const PosError(this.message);

  @override
  List<Object?> get props => [message];
}

// BLoC
class PosBloc extends Bloc<PosEvent, PosState> {
  final PaymentRepository _paymentRepository;
  final MyFatoorahRepository _myfatoorahRepository;

  PosBloc({
    PaymentRepository? paymentRepository,
    MyFatoorahRepository? myfatoorahRepository,
  })  : _paymentRepository = paymentRepository ?? PaymentRepository(),
        _myfatoorahRepository = myfatoorahRepository ?? MyFatoorahRepository(),
        super(PosInitial()) {
    on<InitializePos>(_onInitialize);
    on<ProcessPayment>(_onProcessPayment);
    on<SyncTransactions>(_onSyncTransactions);
    on<RedeemCode>(_onRedeemCode);
    on<RefreshPendingCount>(_onRefreshPendingCount);
    on<CreateMyFatoorahPayment>(_onCreateMyFatoorahPayment);
    on<CreateOfflineOrder>(_onCreateOfflineOrder);
    on<ProcessOfflineOrders>(_onProcessOfflineOrders);
    on<CheckOfflinePayments>(_onCheckOfflinePayments);
  }

  Future<void> _onInitialize(InitializePos event, Emitter<PosState> emit) async {
    emit(PosLoading());
    try {
      final pendingCount = await _paymentRepository.getPendingCount();
      final offlineCount = await _myfatoorahRepository.getPendingCount() +
          await _myfatoorahRepository.getLinkSentCount();
      emit(PosLoaded(
        pendingCount: pendingCount,
        offlineOrderCount: offlineCount,
        isOnline: true,
      ));
    } catch (e) {
      emit(PosError('Failed to initialize: $e'));
    }
  }

  Future<void> _onProcessPayment(
    ProcessPayment event,
    Emitter<PosState> emit,
  ) async {
    emit(PaymentProcessing());
    try {
      final result = await _paymentRepository.processPayment(
        cardNumber: event.cardNumber,
        expiry: event.expiry,
        cvv: event.cvv,
        amount: event.amount,
      );
      emit(PaymentCompleted(result));
      
      // Refresh counts
      final pendingCount = await _paymentRepository.getPendingCount();
      final currentState = state;
      if (currentState is PosLoaded) {
        emit(currentState.copyWith(pendingCount: pendingCount));
      }
    } catch (e) {
      emit(PosError('Payment failed: $e'));
    }
  }

  Future<void> _onSyncTransactions(
    SyncTransactions event,
    Emitter<PosState> emit,
  ) async {
    emit(SyncInProgress());
    try {
      final summary = await _paymentRepository.syncPendingTransactions();
      emit(SyncCompleted(summary));
      
      // Refresh counts
      final pendingCount = await _paymentRepository.getPendingCount();
      final currentState = state;
      if (currentState is PosLoaded) {
        emit(currentState.copyWith(pendingCount: pendingCount));
      }
    } catch (e) {
      emit(PosError('Sync failed: $e'));
    }
  }

  Future<void> _onRedeemCode(
    RedeemCode event,
    Emitter<PosState> emit,
  ) async {
    emit(PosLoading());
    try {
      final result = await _paymentRepository.redeemCode(event.code, event.amount);
      emit(RedeemCompleted(result));
    } catch (e) {
      emit(PosError('Redemption failed: $e'));
    }
  }

  Future<void> _onRefreshPendingCount(
    RefreshPendingCount event,
    Emitter<PosState> emit,
  ) async {
    try {
      final pendingCount = await _paymentRepository.getPendingCount();
      final offlineCount = await _myfatoorahRepository.getPendingCount() +
          await _myfatoorahRepository.getLinkSentCount();
      
      if (state is PosLoaded) {
        emit((state as PosLoaded).copyWith(
          pendingCount: pendingCount,
          offlineOrderCount: offlineCount,
        ));
      } else {
        emit(PosLoaded(
          pendingCount: pendingCount,
          offlineOrderCount: offlineCount,
        ));
      }
    } catch (e) {
      // Silently fail
    }
  }

  Future<void> _onCreateMyFatoorahPayment(
    CreateMyFatoorahPayment event,
    Emitter<PosState> emit,
  ) async {
    emit(PosLoading());
    try {
      final result = await _myfatoorahRepository.createPaymentLink(
        amount: event.amount,
        customerName: event.customerName,
        customerMobile: event.customerMobile,
      );
      emit(MyFatoorahPaymentCreated(result));
    } catch (e) {
      emit(PosError('Failed to create payment: $e'));
    }
  }

  Future<void> _onCreateOfflineOrder(
    CreateOfflineOrder event,
    Emitter<PosState> emit,
  ) async {
    emit(PosLoading());
    try {
      final order = await _myfatoorahRepository.createOfflineOrder(
        amount: event.amount,
        customerName: event.customerName,
        customerPhone: event.customerPhone,
      );
      emit(OfflineOrderCreated(order));
      
      // Refresh counts
      final offlineCount = await _myfatoorahRepository.getPendingCount() +
          await _myfatoorahRepository.getLinkSentCount();
      final currentState = state;
      if (currentState is PosLoaded) {
        emit(currentState.copyWith(offlineOrderCount: offlineCount));
      }
    } catch (e) {
      emit(PosError('Failed to create order: $e'));
    }
  }

  Future<void> _onProcessOfflineOrders(
    ProcessOfflineOrders event,
    Emitter<PosState> emit,
  ) async {
    emit(PosLoading());
    try {
      final orders = await _myfatoorahRepository.processPendingOrders();
      emit(OfflineOrdersProcessed(orders));
      
      // Refresh counts
      final offlineCount = await _myfatoorahRepository.getPendingCount() +
          await _myfatoorahRepository.getLinkSentCount();
      final currentState = state;
      if (currentState is PosLoaded) {
        emit(currentState.copyWith(offlineOrderCount: offlineCount));
      }
    } catch (e) {
      emit(PosError('Failed to process orders: $e'));
    }
  }

  Future<void> _onCheckOfflinePayments(
    CheckOfflinePayments event,
    Emitter<PosState> emit,
  ) async {
    emit(PosLoading());
    try {
      final orders = await _myfatoorahRepository.checkPendingPayments();
      emit(OfflinePaymentsChecked(orders));
    } catch (e) {
      emit(PosError('Failed to check payments: $e'));
    }
  }
}
