import 'package:intl/intl.dart';

/// Date utility functions
class DateUtil {
  static final DateFormat _isoFormat = DateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  static final DateFormat _displayFormat = DateFormat('MMM dd, yyyy HH:mm');
  static final DateFormat _shortFormat = DateFormat('MM/dd/yy HH:mm');
  static final DateFormat _dateFormat = DateFormat('yyyy-MM-dd');
  static final DateFormat _timeFormat = DateFormat('HH:mm:ss');

  /// Format date to ISO 8601 (UTC)
  static String toIsoString(DateTime date) {
    return _isoFormat.format(date.toUtc());
  }

  /// Parse ISO 8601 string
  static DateTime? fromIsoString(String? iso) {
    if (iso == null || iso.isEmpty) return null;
    try {
      return _isoFormat.parseUtc(iso);
    } catch (e) {
      return DateTime.tryParse(iso);
    }
  }

  /// Format for display
  static String toDisplayString(DateTime date) {
    return _displayFormat.format(date);
  }

  /// Format short display
  static String toShortString(DateTime date) {
    return _shortFormat.format(date);
  }

  /// Format date only
  static String toDateString(DateTime date) {
    return _dateFormat.format(date);
  }

  /// Format time only
  static String toTimeString(DateTime date) {
    return _timeFormat.format(date);
  }

  /// Get current timestamp in milliseconds
  static int currentTimestamp() {
    return DateTime.now().millisecondsSinceEpoch;
  }

  /// Format relative time (e.g., "2 hours ago")
  static String toRelativeTime(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);

    if (diff.inDays > 365) {
      return '${(diff.inDays / 365).floor()} years ago';
    } else if (diff.inDays > 30) {
      return '${(diff.inDays / 30).floor()} months ago';
    } else if (diff.inDays > 0) {
      return '${diff.inDays} days ago';
    } else if (diff.inHours > 0) {
      return '${diff.inHours} hours ago';
    } else if (diff.inMinutes > 0) {
      return '${diff.inMinutes} minutes ago';
    } else {
      return 'Just now';
    }
  }

  /// Check if date is today
  static bool isToday(DateTime date) {
    final now = DateTime.now();
    return date.year == now.year && 
           date.month == now.month && 
           date.day == now.day;
  }

  /// Check if date is yesterday
  static bool isYesterday(DateTime date) {
    final yesterday = DateTime.now().subtract(const Duration(days: 1));
    return date.year == yesterday.year && 
           date.month == yesterday.month && 
           date.day == yesterday.day;
  }

  /// Get start of day
  static DateTime startOfDay(DateTime date) {
    return DateTime(date.year, date.month, date.day);
  }

  /// Get end of day
  static DateTime endOfDay(DateTime date) {
    return DateTime(date.year, date.month, date.day, 23, 59, 59, 999);
  }

  /// Add days to date
  static DateTime addDays(DateTime date, int days) {
    return date.add(Duration(days: days));
  }

  /// Format expiry date (MM/YY)
  static String? formatExpiry(int? month, int? year) {
    if (month == null || year == null) return null;
    final m = month.toString().padLeft(2, '0');
    final y = year.toString().substring(2);
    return '$m/$y';
  }

  /// Parse expiry date (MM/YY)
  static Map<String, int>? parseExpiry(String expiry) {
    final parts = expiry.split('/');
    if (parts.length != 2) return null;
    
    final month = int.tryParse(parts[0]);
    var year = int.tryParse(parts[1]);
    
    if (month == null || year == null) return null;
    
    // Convert 2-digit year to 4-digit
    if (year < 100) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
    
    return {'month': month, 'year': year};
  }

  /// Check if expiry is valid (not expired)
  static bool isExpiryValid(int month, int year) {
    final now = DateTime.now();
    final expiry = DateTime(year, month + 1, 0); // Last day of expiry month
    return expiry.isAfter(now);
  }
}
