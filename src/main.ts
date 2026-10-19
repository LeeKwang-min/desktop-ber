import { runGallery } from './gallery';
import { runOverlay } from './overlay';

if (new URLSearchParams(location.search).has('gallery')) runGallery();
else void runOverlay();
