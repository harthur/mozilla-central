/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is mozilla.org code.
 *
 * The Initial Developer of the Original Code is
 * Netscape Communications Corporation.
 * Portions created by the Initial Developer are Copyright (C) 1998
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   IBM Corp.
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either of the GNU General Public License Version 2 or later (the "GPL"),
 * or the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

DIR_ATOM(sCurrentProcess, NS_XPCOM_CURRENT_PROCESS_DIR)
DIR_ATOM(sGRE_Directory, NS_GRE_DIR)
DIR_ATOM(sOS_DriveDirectory, NS_OS_DRIVE_DIR)
DIR_ATOM(sOS_TemporaryDirectory, NS_OS_TEMP_DIR)
DIR_ATOM(sOS_CurrentProcessDirectory, NS_OS_CURRENT_PROCESS_DIR)
DIR_ATOM(sOS_CurrentWorkingDirectory, NS_OS_CURRENT_WORKING_DIR)
DIR_ATOM(sOS_HomeDirectory, NS_OS_HOME_DIR)
DIR_ATOM(sOS_DesktopDirectory, NS_OS_DESKTOP_DIR)
DIR_ATOM(sInitCurrentProcess_dummy, NS_XPCOM_INIT_CURRENT_PROCESS_DIR)
#if defined (MOZ_WIDGET_COCOA)
DIR_ATOM(sDirectory, NS_OS_SYSTEM_DIR)
DIR_ATOM(sTrashDirectory, NS_MAC_TRASH_DIR)
DIR_ATOM(sStartupDirectory, NS_MAC_STARTUP_DIR)
DIR_ATOM(sShutdownDirectory, NS_MAC_SHUTDOWN_DIR)
DIR_ATOM(sAppleMenuDirectory, NS_MAC_APPLE_MENU_DIR)
DIR_ATOM(sControlPanelDirectory, NS_MAC_CONTROL_PANELS_DIR)
DIR_ATOM(sExtensionDirectory, NS_MAC_EXTENSIONS_DIR)
DIR_ATOM(sFontsDirectory, NS_MAC_FONTS_DIR)
DIR_ATOM(sPreferencesDirectory, NS_MAC_PREFS_DIR)
DIR_ATOM(sDocumentsDirectory, NS_MAC_DOCUMENTS_DIR)
DIR_ATOM(sInternetSearchDirectory, NS_MAC_INTERNET_SEARCH_DIR)
DIR_ATOM(sUserLibDirectory, NS_MAC_USER_LIB_DIR)
DIR_ATOM(sDefaultDownloadDirectory, NS_OSX_DEFAULT_DOWNLOAD_DIR)
DIR_ATOM(sUserDesktopDirectory, NS_OSX_USER_DESKTOP_DIR)
DIR_ATOM(sLocalDesktopDirectory, NS_OSX_LOCAL_DESKTOP_DIR)
DIR_ATOM(sUserApplicationsDirectory, NS_OSX_USER_APPLICATIONS_DIR)
DIR_ATOM(sLocalApplicationsDirectory, NS_OSX_LOCAL_APPLICATIONS_DIR)
DIR_ATOM(sUserDocumentsDirectory, NS_OSX_USER_DOCUMENTS_DIR)
DIR_ATOM(sLocalDocumentsDirectory, NS_OSX_LOCAL_DOCUMENTS_DIR)
DIR_ATOM(sUserInternetPlugInDirectory, NS_OSX_USER_INTERNET_PLUGIN_DIR)
DIR_ATOM(sLocalInternetPlugInDirectory, NS_OSX_LOCAL_INTERNET_PLUGIN_DIR)
DIR_ATOM(sUserFrameworksDirectory, NS_OSX_USER_FRAMEWORKS_DIR)
DIR_ATOM(sLocalFrameworksDirectory, NS_OSX_LOCAL_FRAMEWORKS_DIR)
DIR_ATOM(sUserPreferencesDirectory, NS_OSX_USER_PREFERENCES_DIR)
DIR_ATOM(sLocalPreferencesDirectory, NS_OSX_LOCAL_PREFERENCES_DIR)
DIR_ATOM(sPictureDocumentsDirectory, NS_OSX_PICTURE_DOCUMENTS_DIR)
DIR_ATOM(sMovieDocumentsDirectory, NS_OSX_MOVIE_DOCUMENTS_DIR)
DIR_ATOM(sMusicDocumentsDirectory, NS_OSX_MUSIC_DOCUMENTS_DIR)
DIR_ATOM(sInternetSitesDirectory, NS_OSX_INTERNET_SITES_DIR)
#elif defined (XP_WIN) 
DIR_ATOM(sSystemDirectory, NS_OS_SYSTEM_DIR)
DIR_ATOM(sWindowsDirectory, NS_WIN_WINDOWS_DIR)
DIR_ATOM(sWindowsProgramFiles, NS_WIN_PROGRAM_FILES_DIR)
DIR_ATOM(sDesktop, NS_WIN_DESKTOP_DIR)
DIR_ATOM(sPrograms, NS_WIN_PROGRAMS_DIR)
DIR_ATOM(sControls, NS_WIN_CONTROLS_DIR)
DIR_ATOM(sPrinters, NS_WIN_PRINTERS_DIR)
DIR_ATOM(sPersonal, NS_WIN_PERSONAL_DIR)
DIR_ATOM(sFavorites, NS_WIN_FAVORITES_DIR)
DIR_ATOM(sStartup, NS_WIN_STARTUP_DIR)
DIR_ATOM(sRecent, NS_WIN_RECENT_DIR)
DIR_ATOM(sSendto, NS_WIN_SEND_TO_DIR)
DIR_ATOM(sBitbucket, NS_WIN_BITBUCKET_DIR)
DIR_ATOM(sStartmenu, NS_WIN_STARTMENU_DIR)
DIR_ATOM(sDesktopdirectory, NS_WIN_DESKTOP_DIRECTORY)
DIR_ATOM(sDrives, NS_WIN_DRIVES_DIR)
DIR_ATOM(sNetwork, NS_WIN_NETWORK_DIR)
DIR_ATOM(sNethood, NS_WIN_NETHOOD_DIR)
DIR_ATOM(sFonts, NS_WIN_FONTS_DIR)
DIR_ATOM(sTemplates, NS_WIN_TEMPLATES_DIR)
DIR_ATOM(sCommon_Startmenu, NS_WIN_COMMON_STARTMENU_DIR)
DIR_ATOM(sCommon_Programs, NS_WIN_COMMON_PROGRAMS_DIR)
DIR_ATOM(sCommon_Startup, NS_WIN_COMMON_STARTUP_DIR)
DIR_ATOM(sCommon_Desktopdirectory, NS_WIN_COMMON_DESKTOP_DIRECTORY)
DIR_ATOM(sAppdata, NS_WIN_APPDATA_DIR)
DIR_ATOM(sLocalAppdata, NS_WIN_LOCAL_APPDATA_DIR)
DIR_ATOM(sPrinthood, NS_WIN_PRINTHOOD)
DIR_ATOM(sWinCookiesDirectory, NS_WIN_COOKIES_DIR)
DIR_ATOM(sDefaultDownloadDirectory, NS_WIN_DEFAULT_DOWNLOAD_DIR)
#elif defined (XP_UNIX)
DIR_ATOM(sLocalDirectory, NS_UNIX_LOCAL_DIR)
DIR_ATOM(sLibDirectory, NS_UNIX_LIB_DIR)
DIR_ATOM(sDefaultDownloadDirectory, NS_UNIX_DEFAULT_DOWNLOAD_DIR)
DIR_ATOM(sXDGDesktop, NS_UNIX_XDG_DESKTOP_DIR)
DIR_ATOM(sXDGDocuments, NS_UNIX_XDG_DOCUMENTS_DIR)
DIR_ATOM(sXDGDownload, NS_UNIX_XDG_DOWNLOAD_DIR)
DIR_ATOM(sXDGMusic, NS_UNIX_XDG_MUSIC_DIR)
DIR_ATOM(sXDGPictures, NS_UNIX_XDG_PICTURES_DIR)
DIR_ATOM(sXDGPublicShare, NS_UNIX_XDG_PUBLIC_SHARE_DIR)
DIR_ATOM(sXDGTemplates, NS_UNIX_XDG_TEMPLATES_DIR)
DIR_ATOM(sXDGVideos, NS_UNIX_XDG_VIDEOS_DIR)
#elif defined (XP_OS2)
DIR_ATOM(sSystemDirectory, NS_OS_SYSTEM_DIR)
DIR_ATOM(sOS2Directory, NS_OS2_DIR)
#endif
