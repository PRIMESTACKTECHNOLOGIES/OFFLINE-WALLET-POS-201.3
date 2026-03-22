package com.pos2013.offline

import android.app.Application
import timber.log.Timber

/**
 * Application class for POS Offline.
 * Initializes logging and other global configurations.
 */
class PosApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        
        // Initialize Timber for logging
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
    }
}
