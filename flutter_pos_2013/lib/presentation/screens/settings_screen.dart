import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _forceOffline = false;
  final _backendUrlController = TextEditingController(
    text: 'https://pos-offline-sftwr.onrender.com',
  );

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _forceOffline = prefs.getBool('force_offline') ?? false;
    });
  }

  Future<void> _setForceOffline(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('force_offline', value);
    setState(() => _forceOffline = value);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
      ),
      body: ListView(
        children: [
          const ListTile(
            title: Text('Network'),
            subtitle: Text('Connection settings'),
          ),
          SwitchListTile(
            title: const Text('Force Offline Mode'),
            subtitle: const Text('Store all payments locally without syncing'),
            value: _forceOffline,
            onChanged: _setForceOffline,
          ),
          const Divider(),
          const ListTile(
            title: Text('Backend'),
            subtitle: Text('Server configuration'),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              controller: _backendUrlController,
              decoration: const InputDecoration(
                labelText: 'Backend URL',
                hintText: 'https://your-backend.com',
              ),
            ),
          ),
          const Divider(),
          ListTile(
            title: const Text('Sync Now'),
            leading: const Icon(Icons.sync),
            onTap: () {
              // Trigger sync
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Sync triggered')),
              );
            },
          ),
          const Divider(),
          const ListTile(
            title: Text('About'),
          ),
          const ListTile(
            leading: Icon(Icons.info),
            title: Text('App Version'),
            subtitle: Text('2.0.0 - Protocol 201.3'),
          ),
        ],
      ),
    );
  }
}
