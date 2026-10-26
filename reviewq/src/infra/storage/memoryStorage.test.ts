import { createMemoryStorage } from './memoryStorage';
import { describeStorageContract } from './storageContract';

describeStorageContract('memoryStorage', createMemoryStorage);
